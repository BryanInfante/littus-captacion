-- Participant photos move to inscripciones/<event>/<SURNAMES NAMES - DOCUMENT>/foto.<ext>
-- so the operator can tell whose file it is. Rows written before this
-- migration keep their legacy path (inscripciones/<event>/fotos/<DOC>_<id>.<ext>);
-- both layouts stay valid and no stored file is renamed.
alter table public.eccia_fichas_inspector
  drop constraint eccia_fichas_inspector_foto_path_check;

alter table public.eccia_fichas_inspector
  add constraint eccia_fichas_inspector_foto_path_check check (
    (
      -- Legacy layout.
      foto_path ~ '^[A-Za-z0-9_-]+( [A-Za-z0-9_-]+)*(/[A-Za-z0-9_-]+( [A-Za-z0-9_-]+)*)*/inscripciones/[a-z0-9-]+/fotos/[0-9A-Z-]+_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png)$'
      and right(foto_path, char_length('/inscripciones/' || masterclass_codigo || '/fotos/' || documento || '_' || id || '.jpg'))
        in ('/inscripciones/' || masterclass_codigo || '/fotos/' || documento || '_' || id || '.jpg',
            '/inscripciones/' || masterclass_codigo || '/fotos/' || documento || '_' || id || '.png')
    )
    or (
      -- Participant folder: the document ends the folder name, so the path
      -- is tied to the row's own event and document.
      foto_path ~ '^[A-Za-z0-9_-]+( [A-Za-z0-9_-]+)*(/[A-Za-z0-9_-]+( [A-Za-z0-9_-]+)*)*/inscripciones/[a-z0-9-]+/([A-Z0-9]+( [A-Z0-9]+)* - )?[0-9A-Z-]+/foto\.(jpg|png)$'
      and foto_path ~ ('/inscripciones/' || masterclass_codigo
        || '/([A-Z0-9]+( [A-Z0-9]+)* - )?' || documento || '/foto\.(jpg|png)$')
    )
  );
