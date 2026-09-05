-- Corrects the metallography course after the details were confirmed:
-- 16 hours (not 40), and certificates issued under the LEYV mark instead of
-- ECCIA. Applied as its own migration rather than by editing the seed in
-- 20260905020000, which has already run.
--
-- The random suffix of the existing certificate is preserved: only the brand
-- segment of the code changes, so it stays the same certificate.

update public.eccia_eventos
set duracion = '16h',
    codigo_prefijo = 'LEYV-PMM-'
where masterclass_codigo = 'preparador-muestras-metalograficas';

update public.eccia_masterclass_certificados
set codigo_certificado = 'LEYV-PMM-164093C0',
    validation_url = 'https://preinscripcion.littusgroup.com/validar-certificado.html?code=LEYV-PMM-164093C0'
where codigo_certificado = 'ECCIA-PMM-164093C0';
