-- ═══════════════════════════════════════════════════════════════════════════
-- TODO EN LA BASE — proyecto de BIENES INMUEBLES
-- Pegar completo en el editor SQL de Supabase (el proyecto de INMUEBLES, que es
-- distinto al de muebles) y darle Run. Una sola vez.
--
-- Es ADITIVO: solo agrega columnas. No modifica, no borra y no reescribe ningún
-- dato existente. Se puede correr dos veces sin problema.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Comentarios internos del inmueble ────────────────────────────────────
alter table public.bienesinmuebles add column if not exists comentarios text;

-- ── 2. Trámite de desincorporación ──────────────────────────────────────────
-- La categoría de la que salió (para poder regresarlo si se cancela) y la fecha
-- y observaciones de cada etapa. Todo esto vivía en el navegador.
alter table public.bienesinmuebles add column if not exists categoria_original integer;
alter table public.bienesinmuebles add column if not exists fecha_proceso      date;
alter table public.bienesinmuebles add column if not exists obs_proceso        text;
alter table public.bienesinmuebles add column if not exists fecha_desinc       date;
alter table public.bienesinmuebles add column if not exists obs_desinc         text;

-- ── 3. Índice de consulta (opcional) ────────────────────────────────────────
create index if not exists bienesinmuebles_categoria_idx
  on public.bienesinmuebles (idcategoria);

-- ── 4. Comprobación ─────────────────────────────────────────────────────────
-- Debe devolver 6 renglones, todos en 'listo'.
select c.columna as objeto,
       case when exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='bienesinmuebles'
                and column_name=c.columna)
            then 'listo' else 'FALTA' end as estado
from (values ('comentarios'),('categoria_original'),('fecha_proceso'),
             ('obs_proceso'),('fecha_desinc'),('obs_desinc')) as c(columna);
