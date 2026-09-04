-- ==============================================================================
-- MIGRATION: AUTENTICAÇÃO E CONTROLE DE ACESSO RBAC (SUPABASE + INFOSEC TOTVS)
-- ==============================================================================
-- Este script:
-- 1. Cria a tabela de perfis de usuários com RBAC (ADMIN, CONSULTOR, CLIENTE).
-- 2. Cria gatilho automático para novos cadastros (status inicial: PENDENTE).
-- 3. Revoga políticas de acesso anônimo (público) que foram advertidas pela Segurança.
-- 4. Estabelece políticas RLS rigorosas:
--    - ADMIN / CONSULTOR: Gestão total e acesso ao Hub 360°.
--    - CLIENTE: Acesso restrito APENAS ao Portal De-Para e SOMENTE aos projetos autorizados.
-- ==============================================================================

-- 1. TABELA DE PERFIS DE USUÁRIOS
CREATE TABLE IF NOT EXISTS public.perfis_usuarios (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    nome_completo TEXT,
    cargo TEXT,
    role VARCHAR(20) NOT NULL DEFAULT 'CLIENTE' CHECK (role IN ('ADMIN', 'CONSULTOR', 'CLIENTE')),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE', 'APROVADO', 'BLOQUEADO')),
    projetos_autorizados TEXT[] DEFAULT '{}', -- Array de códigos de projetos, ex: ARRAY['T004821-P00001']
    aprovado_por TEXT,
    data_aprovacao TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ativa RLS na tabela de perfis
ALTER TABLE public.perfis_usuarios ENABLE ROW LEVEL SECURITY;

-- 2. FUNÇÃO AUXILIAR PARA CONSULTAR PERFIL DO USUÁRIO ATUAL (SEM RECURSÃO)
CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS TABLE (
    user_role VARCHAR,
    user_status VARCHAR,
    projetos TEXT[]
) 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY 
    SELECT p.role, p.status, p.projetos_autorizados
    FROM public.perfis_usuarios p
    WHERE p.id = auth.uid();
END;
$$;

-- Função auxiliar rápida para checar se é Admin ou Consultor Aprovado
CREATE OR REPLACE FUNCTION public.is_consultor_or_admin()
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.perfis_usuarios
        WHERE id = auth.uid()
          AND role IN ('ADMIN', 'CONSULTOR')
          AND status = 'APROVADO'
    );
END;
$$;

-- Função auxiliar rápida para checar se é Admin Aprovado
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.perfis_usuarios
        WHERE id = auth.uid()
          AND role = 'ADMIN'
          AND status = 'APROVADO'
    );
END;
$$;

-- 3. POLÍTICAS DE RLS PARA A TABELA perfis_usuarios
DROP POLICY IF EXISTS "Perfis: Leitura Propria ou Admin" ON public.perfis_usuarios;
CREATE POLICY "Perfis: Leitura Propria ou Admin" ON public.perfis_usuarios
    FOR SELECT
    TO authenticated
    USING (
        id = auth.uid() OR public.is_admin()
    );

DROP POLICY IF EXISTS "Perfis: Atualizacao Apenas por Admin" ON public.perfis_usuarios;
CREATE POLICY "Perfis: Atualizacao Apenas por Admin" ON public.perfis_usuarios
    FOR UPDATE
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Perfis: Insercao Propria ou Trigger" ON public.perfis_usuarios;
CREATE POLICY "Perfis: Insercao Propria ou Trigger" ON public.perfis_usuarios
    FOR INSERT
    TO authenticated
    WITH CHECK (id = auth.uid() OR public.is_admin());

-- 4. TRIGGER: CRIAÇÃO AUTOMÁTICA DE PERFIL NO CADASTRO (SIGN UP)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    requested_role VARCHAR;
    user_name TEXT;
    target_project TEXT;
    initial_projects TEXT[];
BEGIN
    -- Lê metadados opcionais passados no momento do cadastro
    requested_role := COALESCE(NEW.raw_user_meta_data->>'role', 'CLIENTE');
    -- Evita que alguém se cadastre forçando 'ADMIN' diretamente pelo frontend
    IF requested_role NOT IN ('CLIENTE', 'CONSULTOR') THEN
        requested_role := 'CLIENTE';
    END IF;

    user_name := COALESCE(NEW.raw_user_meta_data->>'nome_completo', split_part(NEW.email, '@', 1));
    target_project := NEW.raw_user_meta_data->>'projeto';
    
    IF target_project IS NOT NULL AND target_project <> '' THEN
        initial_projects := ARRAY[target_project];
    ELSE
        initial_projects := ARRAY[]::TEXT[];
    END IF;

    INSERT INTO public.perfis_usuarios (
        id,
        email,
        nome_completo,
        cargo,
        role,
        status,
        projetos_autorizados,
        created_at,
        updated_at
    ) VALUES (
        NEW.id,
        NEW.email,
        user_name,
        COALESCE(NEW.raw_user_meta_data->>'cargo', 'Usuário'),
        requested_role,
        'PENDENTE', -- Todos entram como PENDENTE aguardando aprovação do Admin!
        initial_projects,
        NOW(),
        NOW()
    )
    ON CONFLICT (id) DO UPDATE 
    SET email = EXCLUDED.email,
        updated_at = NOW();

    RETURN NEW;
END;
$$;

-- Registra a trigger em auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5. REVOGAÇÃO DAS ANTIGAS POLÍTICAS ANÔNIMAS (SEGURANÇA TOTVS)
DO $$ 
DECLARE 
    t text;
BEGIN
    FOR t IN 
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN (
            'clientes_totvs', 'projetos_depara', 
            'depara_coligadas', 'depara_funcoes', 'depara_sindicatos', 'depara_secoes', 
            'depara_bancos', 'depara_situacao', 'depara_eventos', 'depara_horario', 
            'depara_motivo_funcao', 'depara_motivo_salario', 'depara_motivo_secao',
            'dados_rm_eventos', 'dados_rm_situacao', 'dados_rm_motivos', 'dados_rm_secoes'
        )
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Acesso Total Anonimo %I" ON %I;', t, t);
        EXECUTE format('DROP POLICY IF EXISTS "Acesso Autenticado %I" ON %I;', t, t);
    END LOOP;
END $$;

-- 6. NOVAS POLÍTICAS RLS BASEADAS EM AUTENTICAÇÃO E PROJETOS
-- 6.1 Clientes TOTVS: Apenas Consultores/Admins aprovados
CREATE POLICY "Clientes: Consultores e Admins" ON public.clientes_totvs
    FOR ALL
    TO authenticated
    USING (public.is_consultor_or_admin())
    WITH CHECK (public.is_consultor_or_admin());

-- 6.2 Projetos DePara: Consultor/Admin vê tudo; Cliente vê apenas projetos autorizados
CREATE POLICY "Projetos: Acesso por Perfil" ON public.projetos_depara
    FOR ALL
    TO authenticated
    USING (
        public.is_consultor_or_admin()
        OR (
            EXISTS (
                SELECT 1 FROM public.perfis_usuarios p
                WHERE p.id = auth.uid()
                  AND p.status = 'APROVADO'
                  AND p.role = 'CLIENTE'
                  AND projetos_depara.codigo_projeto = ANY(p.projetos_autorizados)
            )
        )
    )
    WITH CHECK (
        public.is_consultor_or_admin()
        OR (
            EXISTS (
                SELECT 1 FROM public.perfis_usuarios p
                WHERE p.id = auth.uid()
                  AND p.status = 'APROVADO'
                  AND p.role = 'CLIENTE'
                  AND projetos_depara.codigo_projeto = ANY(p.projetos_autorizados)
            )
        )
    );

-- 6.3 Tabelas de DePara e Dados RM (Acesso granular por projeto)
DO $$ 
DECLARE 
    t text;
BEGIN
    FOR t IN 
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN (
            'depara_coligadas', 'depara_funcoes', 'depara_sindicatos', 'depara_secoes', 
            'depara_bancos', 'depara_situacao', 'depara_eventos', 'depara_horario', 
            'depara_motivo_funcao', 'depara_motivo_salario', 'depara_motivo_secao',
            'dados_rm_eventos', 'dados_rm_situacao', 'dados_rm_motivos', 'dados_rm_secoes'
        )
    LOOP
        EXECUTE format('
            CREATE POLICY "DePara: Acesso %I" ON public.%I
            FOR ALL
            TO authenticated
            USING (
                public.is_consultor_or_admin()
                OR EXISTS (
                    SELECT 1 
                    FROM public.projetos_depara proj
                    JOIN public.perfis_usuarios p ON p.id = auth.uid()
                    WHERE proj.id = %I.projeto_id
                      AND p.status = ''APROVADO''
                      AND proj.codigo_projeto = ANY(p.projetos_autorizados)
                )
            )
            WITH CHECK (
                public.is_consultor_or_admin()
                OR EXISTS (
                    SELECT 1 
                    FROM public.projetos_depara proj
                    JOIN public.perfis_usuarios p ON p.id = auth.uid()
                    WHERE proj.id = %I.projeto_id
                      AND p.status = ''APROVADO''
                      AND proj.codigo_projeto = ANY(p.projetos_autorizados)
                )
            );
        ', t, t, t, t);
    END LOOP;
END $$;

-- 7. VINCULAR USUÁRIO EXISTENTE (ADMIN MASTER)
-- Sincroniza os usuários já existentes no auth.users
INSERT INTO public.perfis_usuarios (id, email, nome_completo, role, status)
SELECT 
    u.id, 
    u.email, 
    COALESCE(u.raw_user_meta_data->>'nome_completo', split_part(u.email, '@', 1)),
    'CONSULTOR',
    'APROVADO'
FROM auth.users u
ON CONFLICT (id) DO NOTHING;

-- 8. DEFINIR GUSTAVO COMO ADMIN MASTER APROVADO
UPDATE public.perfis_usuarios 
SET role = 'ADMIN', status = 'APROVADO' 
WHERE email = 'gustavo.csf@gmail.com';
