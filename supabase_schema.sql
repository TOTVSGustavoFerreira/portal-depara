-- ==============================================================================
-- SCHEMA COMPLETO E LIMPO: PORTAL DE-PARA TOTVS RM (POSTGRESQL / SUPABASE)
-- Estrutura 100% Dinâmica (Sem dados chumbados - tudo importado via Excel)
-- ==============================================================================

-- 1. TABELA DE CLIENTES TOTVS
CREATE TABLE IF NOT EXISTS clientes_totvs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo_totvs VARCHAR(30) UNIQUE NOT NULL, -- Ex: 'T004821'
    razao_social VARCHAR(255) NOT NULL,
    nome_fantasia VARCHAR(255),
    cnpj VARCHAR(20), -- Informativo / Opcional
    consultor_responsavel VARCHAR(150),
    contato_rh VARCHAR(150),
    email_contato VARCHAR(150),
    observacoes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. TABELA DE PROJETOS DE-PARA (VINCULADOS AO CLIENTE TOTVS)
CREATE TABLE IF NOT EXISTS projetos_depara (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo_projeto VARCHAR(50) UNIQUE NOT NULL, -- Ex: 'T004821-P00001'
    cliente_id UUID NOT NULL REFERENCES clientes_totvs(id) ON DELETE CASCADE,
    titulo VARCHAR(255) NOT NULL, -- Ex: 'Migração Folha de Pagamento - Matriz'
    tipo_migracao VARCHAR(50) DEFAULT 'FOLHA_PONTO',
    status VARCHAR(30) DEFAULT 'EM_ANDAMENTO', -- 'PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDO'
    passkey VARCHAR(100) NOT NULL DEFAULT '1234',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. AS 11 TABELAS DE MAPEAMENTO DE-PARA (VINCULADAS AO PROJETO)

-- 3.1 ZDEPARA_COLIGADAS
CREATE TABLE IF NOT EXISTS depara_coligadas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    projeto_id UUID NOT NULL REFERENCES projetos_depara(id) ON DELETE CASCADE,
    empresa_de VARCHAR(50),
    id_origem VARCHAR(50),
    nome_de VARCHAR(255),
    cnpj VARCHAR(30),
    codcoligada_para VARCHAR(50),
    status VARCHAR(30) DEFAULT 'PENDENTE',
    sugestoes TEXT,
    observacao TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3.2 ZDEPARA_FUNCOES
CREATE TABLE IF NOT EXISTS depara_funcoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    projeto_id UUID NOT NULL REFERENCES projetos_depara(id) ON DELETE CASCADE,
    empresa_de VARCHAR(50),
    codigo_de VARCHAR(50),
    nome_de VARCHAR(255),
    cbo VARCHAR(30),
    cbo_2002 VARCHAR(30),
    coligada_para VARCHAR(50),
    codigo_para VARCHAR(50),
    status VARCHAR(30) DEFAULT 'PENDENTE',
    sugestoes TEXT,
    observacao TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3.3 ZDEPARA_SINDICATOS
CREATE TABLE IF NOT EXISTS depara_sindicatos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    projeto_id UUID NOT NULL REFERENCES projetos_depara(id) ON DELETE CASCADE,
    empresa_de VARCHAR(50),
    codigo_de VARCHAR(50),
    nome_de VARCHAR(255),
    cnpj VARCHAR(30),
    coligada_para VARCHAR(50),
    codigo_para VARCHAR(50),
    status VARCHAR(30) DEFAULT 'PENDENTE',
    sugestoes TEXT,
    observacao TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3.4 ZDEPARA_SECOES
CREATE TABLE IF NOT EXISTS depara_secoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    projeto_id UUID NOT NULL REFERENCES projetos_depara(id) ON DELETE CASCADE,
    empresa_de VARCHAR(50),
    filial_de VARCHAR(50),
    codigo_de VARCHAR(50),
    nome_de VARCHAR(255),
    coligada_para VARCHAR(50),
    filial_para VARCHAR(50),
    codigo_para VARCHAR(50),
    descricao_secao VARCHAR(255),
    status VARCHAR(30) DEFAULT 'PENDENTE',
    sugestoes TEXT,
    observacao TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3.5 ZDEPARA_BANCOS
CREATE TABLE IF NOT EXISTS depara_bancos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    projeto_id UUID NOT NULL REFERENCES projetos_depara(id) ON DELETE CASCADE,
    empresa_de VARCHAR(50),
    numbanco_de VARCHAR(50),
    nome_banco_de VARCHAR(255),
    numagencia_de VARCHAR(50),
    nome_agencia_de VARCHAR(255),
    codigo_banco_para VARCHAR(50),
    codigo_agencia_para VARCHAR(50),
    status VARCHAR(30) DEFAULT 'PENDENTE',
    sugestoes TEXT,
    observacao TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3.6 ZDEPARA_SITUACAO
CREATE TABLE IF NOT EXISTS depara_situacao (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    projeto_id UUID NOT NULL REFERENCES projetos_depara(id) ON DELETE CASCADE,
    codigo_de VARCHAR(50),
    nome_de VARCHAR(255),
    codsituacao_para VARCHAR(50),
    codmotivo_para VARCHAR(50),
    codsituacao_retorno_para VARCHAR(50),
    codmotivo_retorno_para VARCHAR(50),
    status VARCHAR(30) DEFAULT 'PENDENTE',
    sugestoes TEXT,
    observacao TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3.7 ZDEPARA_EVENTOS
CREATE TABLE IF NOT EXISTS depara_eventos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    projeto_id UUID NOT NULL REFERENCES projetos_depara(id) ON DELETE CASCADE,
    empresa_de VARCHAR(50),
    codigo_de VARCHAR(50),
    nome_de VARCHAR(255),
    tipo_evento VARCHAR(50),
    coligada_para VARCHAR(50),
    codigo_para VARCHAR(50),
    nome_rm VARCHAR(255),
    codigo_para_ficha_mes1 VARCHAR(50),
    nome_rm_2 VARCHAR(255),
    codigo_para_ficha_mes2 VARCHAR(50),
    nome_rm_3 VARCHAR(255),
    codigo_para_verbas_ferias VARCHAR(50),
    nome_rm_4 VARCHAR(255),
    status VARCHAR(30) DEFAULT 'PENDENTE',
    sugestoes TEXT,
    observacao TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3.8 ZDEPARA_HORARIO
CREATE TABLE IF NOT EXISTS depara_horario (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    projeto_id UUID NOT NULL REFERENCES projetos_depara(id) ON DELETE CASCADE,
    empresa_de VARCHAR(50),
    codigo_de VARCHAR(50),
    nome_de VARCHAR(255),
    coligada_para VARCHAR(50),
    codigo_para VARCHAR(50),
    status VARCHAR(30) DEFAULT 'PENDENTE',
    sugestoes TEXT,
    observacao TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3.9 ZDEPARA_MOTIVO_FUNCAO
CREATE TABLE IF NOT EXISTS depara_motivo_funcao (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    projeto_id UUID NOT NULL REFERENCES projetos_depara(id) ON DELETE CASCADE,
    empresa_de VARCHAR(50),
    codigo_motivo_de VARCHAR(50),
    nome_motivo_de VARCHAR(255),
    coligada_para VARCHAR(50),
    codigo_motivo_para VARCHAR(50),
    status VARCHAR(30) DEFAULT 'PENDENTE',
    sugestoes TEXT,
    observacao TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3.10 ZDEPARA_MOTIVO_SALARIO
CREATE TABLE IF NOT EXISTS depara_motivo_salario (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    projeto_id UUID NOT NULL REFERENCES projetos_depara(id) ON DELETE CASCADE,
    empresa_de VARCHAR(50),
    codigo_motivo_de VARCHAR(50),
    nome_motivo_de VARCHAR(255),
    coligada_para VARCHAR(50),
    codigo_para VARCHAR(50),
    status VARCHAR(30) DEFAULT 'PENDENTE',
    sugestoes TEXT,
    observacao TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3.11 ZDEPARA_MOTIVO_SECAO
CREATE TABLE IF NOT EXISTS depara_motivo_secao (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    projeto_id UUID NOT NULL REFERENCES projetos_depara(id) ON DELETE CASCADE,
    empresa_de VARCHAR(50),
    codigo_motivo_de VARCHAR(50),
    nome_motivo_de VARCHAR(255),
    coligada_para VARCHAR(50),
    codigo_motivo_para VARCHAR(50),
    status VARCHAR(30) DEFAULT 'PENDENTE',
    sugestoes TEXT,
    observacao TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. CATÁLOGOS DE APOIO TOTVS RM (VINCULADOS AO PROJETO - IMPORTADOS DO EXCEL)
CREATE TABLE IF NOT EXISTS dados_rm_eventos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    projeto_id UUID NOT NULL REFERENCES projetos_depara(id) ON DELETE CASCADE,
    codigo VARCHAR(50) NOT NULL,
    descricao VARCHAR(255) NOT NULL,
    tipo VARCHAR(50),
    valhordiaref VARCHAR(50),
    nat_esocial VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dados_rm_situacao (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    projeto_id UUID NOT NULL REFERENCES projetos_depara(id) ON DELETE CASCADE,
    codcliente VARCHAR(50) NOT NULL,
    descricao VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dados_rm_motivos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    projeto_id UUID NOT NULL REFERENCES projetos_depara(id) ON DELETE CASCADE,
    codcliente VARCHAR(50) NOT NULL,
    descricao VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dados_rm_secoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    projeto_id UUID NOT NULL REFERENCES projetos_depara(id) ON DELETE CASCADE,
    coligada VARCHAR(50),
    filial VARCHAR(50),
    cod_secao VARCHAR(50),
    descricao VARCHAR(255),
    cnpj VARCHAR(30),
    observacoes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. ÍNDICES DE ALTA PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_clientes_codigo ON clientes_totvs(codigo_totvs);
CREATE INDEX IF NOT EXISTS idx_projetos_codigo ON projetos_depara(codigo_projeto);
CREATE INDEX IF NOT EXISTS idx_eventos_proj ON depara_eventos(projeto_id);
CREATE INDEX IF NOT EXISTS idx_coligadas_proj ON depara_coligadas(projeto_id);
CREATE INDEX IF NOT EXISTS idx_funcoes_proj ON depara_funcoes(projeto_id);
CREATE INDEX IF NOT EXISTS idx_sindicatos_proj ON depara_sindicatos(projeto_id);
CREATE INDEX IF NOT EXISTS idx_secoes_proj ON depara_secoes(projeto_id);
CREATE INDEX IF NOT EXISTS idx_bancos_proj ON depara_bancos(projeto_id);
CREATE INDEX IF NOT EXISTS idx_situacao_proj ON depara_situacao(projeto_id);
CREATE INDEX IF NOT EXISTS idx_horario_proj ON depara_horario(projeto_id);
CREATE INDEX IF NOT EXISTS idx_motivo_func_proj ON depara_motivo_funcao(projeto_id);
CREATE INDEX IF NOT EXISTS idx_motivo_sal_proj ON depara_motivo_salario(projeto_id);
CREATE INDEX IF NOT EXISTS idx_motivo_sec_proj ON depara_motivo_secao(projeto_id);
CREATE INDEX IF NOT EXISTS idx_rm_eventos_proj ON dados_rm_eventos(projeto_id);
CREATE INDEX IF NOT EXISTS idx_rm_situacao_proj ON dados_rm_situacao(projeto_id);
CREATE INDEX IF NOT EXISTS idx_rm_motivos_proj ON dados_rm_motivos(projeto_id);
CREATE INDEX IF NOT EXISTS idx_rm_secoes_proj ON dados_rm_secoes(projeto_id);

-- 6. HABILITAR ROW LEVEL SECURITY (RLS)
ALTER TABLE clientes_totvs ENABLE ROW LEVEL SECURITY;
ALTER TABLE projetos_depara ENABLE ROW LEVEL SECURITY;
ALTER TABLE depara_coligadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE depara_funcoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE depara_sindicatos ENABLE ROW LEVEL SECURITY;
ALTER TABLE depara_secoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE depara_bancos ENABLE ROW LEVEL SECURITY;
ALTER TABLE depara_situacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE depara_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE depara_horario ENABLE ROW LEVEL SECURITY;
ALTER TABLE depara_motivo_funcao ENABLE ROW LEVEL SECURITY;
ALTER TABLE depara_motivo_salario ENABLE ROW LEVEL SECURITY;
ALTER TABLE depara_motivo_secao ENABLE ROW LEVEL SECURITY;
ALTER TABLE dados_rm_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE dados_rm_situacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE dados_rm_motivos ENABLE ROW LEVEL SECURITY;
ALTER TABLE dados_rm_secoes ENABLE ROW LEVEL SECURITY;

-- 6. TABELA DE PERFIS DE USUÁRIOS E GOVERNANÇA RBAC
CREATE TABLE IF NOT EXISTS public.perfis_usuarios (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    nome_completo TEXT,
    role TEXT NOT NULL DEFAULT 'CLIENTE' CHECK (role IN ('ADMIN', 'CONSULTOR', 'CLIENTE')),
    status TEXT NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE', 'APROVADO', 'BLOQUEADO')),
    projetos_autorizados TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 7. FUNÇÕES DE SUPORTE À SEGURANÇA (SECURITY DEFINER)
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

-- 8. HABILITAR ROW LEVEL SECURITY (RLS) EM TODAS AS TABELAS
ALTER TABLE public.perfis_usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes_totvs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projetos_depara ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.depara_coligadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.depara_funcoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.depara_sindicatos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.depara_secoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.depara_bancos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.depara_situacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.depara_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.depara_horario ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.depara_motivo_funcao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.depara_motivo_salario ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.depara_motivo_secao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dados_rm_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dados_rm_situacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dados_rm_motivos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dados_rm_secoes ENABLE ROW LEVEL SECURITY;

-- 9. REMOÇÃO DE QUALQUER POLÍTICA ANÔNIMA RESIDUAL
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

-- 10. POLÍTICAS DE RLS SEGURAS (RBAC - EXCLUSIVAMENTE AUTENTICADO)

-- 10.1 Perfis de Usuários
DROP POLICY IF EXISTS "Perfis: Leitura Propria ou Admin" ON public.perfis_usuarios;
CREATE POLICY "Perfis: Leitura Propria ou Admin" ON public.perfis_usuarios
    FOR SELECT
    TO authenticated
    USING (id = auth.uid() OR public.is_admin());

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

-- 10.2 Clientes TOTVS: Consultores e Admins
DROP POLICY IF EXISTS "Clientes: Consultores e Admins" ON public.clientes_totvs;
CREATE POLICY "Clientes: Consultores e Admins" ON public.clientes_totvs
    FOR ALL
    TO authenticated
    USING (public.is_consultor_or_admin())
    WITH CHECK (public.is_consultor_or_admin());

-- 10.3 Projetos DePara: Consultor/Admin vê todos; Cliente vê estritamente projetos autorizados
DROP POLICY IF EXISTS "Projetos: Acesso por Perfil" ON public.projetos_depara;
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

-- 10.4 Tabelas Operacionais DePara e Dados RM (Acesso granular restrito ao projeto)
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
        EXECUTE format('DROP POLICY IF EXISTS "Leitura por Projeto %I" ON public.%I;', t, t);
        EXECUTE format('
            CREATE POLICY "Leitura por Projeto %I" ON public.%I
                FOR SELECT
                TO authenticated
                USING (
                    public.is_consultor_or_admin()
                    OR EXISTS (
                        SELECT 1 FROM public.projetos_depara proj
                        JOIN public.perfis_usuarios u ON u.id = auth.uid()
                        WHERE proj.id = %I.projeto_id
                          AND u.status = ''APROVADO''
                          AND u.role = ''CLIENTE''
                          AND proj.codigo_projeto = ANY(u.projetos_autorizados)
                    )
                );
        ', t, t, t);

        EXECUTE format('DROP POLICY IF EXISTS "Gravacao por Projeto %I" ON public.%I;', t, t);
        EXECUTE format('
            CREATE POLICY "Gravacao por Projeto %I" ON public.%I
                FOR ALL
                TO authenticated
                USING (
                    public.is_consultor_or_admin()
                    OR EXISTS (
                        SELECT 1 FROM public.projetos_depara proj
                        JOIN public.perfis_usuarios u ON u.id = auth.uid()
                        WHERE proj.id = %I.projeto_id
                          AND u.status = ''APROVADO''
                          AND u.role = ''CLIENTE''
                          AND proj.codigo_projeto = ANY(u.projetos_autorizados)
                    )
                )
                WITH CHECK (
                    public.is_consultor_or_admin()
                    OR EXISTS (
                        SELECT 1 FROM public.projetos_depara proj
                        JOIN public.perfis_usuarios u ON u.id = auth.uid()
                        WHERE proj.id = %I.projeto_id
                          AND u.status = ''APROVADO''
                          AND u.role = ''CLIENTE''
                          AND proj.codigo_projeto = ANY(u.projetos_autorizados)
                    )
                );
        ', t, t, t);
    END LOOP;
END $$;

-- 11. TRIGGER DE CADASTRO AUTOMÁTICO DE USUÁRIO (auth.users -> perfis_usuarios)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    is_totvs BOOLEAN;
    assigned_role TEXT;
    assigned_status TEXT;
    user_nome TEXT;
BEGIN
    is_totvs := (NEW.email ILIKE '%@totvs.com.br');
    user_nome := COALESCE(NEW.raw_user_meta_data->>'nome_completo', split_part(NEW.email, '@', 1));
    
    IF is_totvs THEN
        assigned_role := 'CONSULTOR';
        assigned_status := 'APROVADO';
    ELSE
        assigned_role := 'CLIENTE';
        assigned_status := 'PENDENTE';
    END IF;

    INSERT INTO public.perfis_usuarios (id, email, nome_completo, role, status, projetos_autorizados)
    VALUES (NEW.id, NEW.email, user_nome, assigned_role, assigned_status, '{}')
    ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        nome_completo = COALESCE(EXCLUDED.nome_completo, perfis_usuarios.nome_completo);

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
