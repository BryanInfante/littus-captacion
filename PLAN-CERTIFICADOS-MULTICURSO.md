# Plan: emisión automática de certificados para varios cursos

Estado: **planificado, no implementado.**

`validate-certificate` ya lee los metadatos de `eccia_eventos`, así que un
certificado de cualquier curso **valida** correctamente. Lo que falta es
`issue-certificate`: emitir automáticamente —generar el PDF, subirlo y enviarlo—
sigue funcionando solo para el seminario de ultrasonido.

Hoy un certificado de otro curso se crea a mano en la base con
`certificate_status = 'external'`, como se hizo con `ECCIA-PMM-164093C0`.

## Qué está hardcodeado hoy

`supabase/functions/issue-certificate/index.ts`:

| Línea | Valor | Destino |
| --- | --- | --- |
| 10 | `MASTERCLASS_CODE` | viene en el payload de la petición |
| 13 | `EVENT_TITLE` | `eventos.event_title` |
| 77 | prefijo `ECCIA-UT1-` | `eventos.codigo_prefijo` |
| 380 | `'Seminario de Ultrasonido'` | `eventos.event_title_linea_1` |
| 381 | `'Industrial Nivel I'` | `eventos.event_title_linea_2` |
| 393 | párrafo de descripción | `eventos.descripcion` |
| 399 | `'2h'` | `eventos.duracion` |
| 401 | `'03 de julio de 2026'` | `eventos.fecha_texto` |
| 772 | `masterclass-ultrasonido-nivel-i/2026/` | `eventos.nextcloud_directorio` |
| 114 | `templates/certificate-base.pdf` | **falta columna** |
| 421-422 | nombres y cargos de los dos firmantes | **faltan columnas** |
| 104-105 | rutas de las imágenes de firma | **faltan columnas** |

## La tabla que creé está incompleta

`eccia_eventos` cubre las nueve primeras filas. No cubre la plantilla ni las
firmas. Hace falta una migración adicional:

```sql
alter table public.eccia_eventos
  add column if not exists template_path text,
  add column if not exists firma_1_nombre text,
  add column if not exists firma_1_cargo text,
  add column if not exists firma_1_imagen_path text,
  add column if not exists firma_2_nombre text,
  add column if not exists firma_2_cargo text,
  add column if not exists firma_2_imagen_path text;
```

Las firmas son deliberadamente rutas de Nextcloud, no URLs públicas: son firmas
manuscritas reales de directivos y nunca deben servirse anónimamente. Ver el
comentario en `issue-certificate/index.ts:100-103`.

## El bloqueo real: no hay forma de crear la plantilla de un curso nuevo

`buildCertificateTemplate` (línea 273) construye el PDF base con el logo, las
firmas, las decoraciones y **todas las etiquetas estáticas ya dibujadas**. Está
exportada, pero **ningún código la llama**: no hay endpoint, no hay script, no
hay comando. La `templates/certificate-base.pdf` que existe hoy en Nextcloud se
generó por algún medio que no quedó en el repositorio.

O sea que un curso nuevo no tiene plantilla y no hay manera de producirla.

Tres salidas, de menos a más trabajo:

1. **Un endpoint de mantenimiento** protegido por frase de aprobación, igual que
   el gate de `send-workshop-reminder`. Recibe un `masterclass_codigo`, lee su
   fila de `eccia_eventos`, construye la plantilla y la sube. Es el camino que
   mejor encaja con lo que ya existe.
2. **Un script local** que importe `buildCertificateTemplate` con Deno y suba el
   resultado por WebDAV. No requiere desplegar nada, pero necesita las
   credenciales de Nextcloud en la máquina de quien lo corra.
3. **Diseñar la plantilla a mano** (Canva u otro) y subirla a la ruta que diga
   `template_path`. Es lo más rápido y lo que ya se hizo de facto para
   metalografía, pero rompe la consistencia visual con las generadas por código.

## Orden sugerido

1. Migración con las siete columnas que faltan; rellenar la fila del seminario
   de ultrasonido con sus valores actuales.
2. Resolver la generación de plantillas (una de las tres salidas de arriba) y
   producir la de `preparador-muestras-metalograficas`.
3. Cambiar `issue-certificate` para que reciba `masterclass_codigo` en el
   payload, cargue su fila de `eccia_eventos` y falle con 400 si no existe o si
   `activo = false`. Nada de valores por defecto: un certificado con el curso
   equivocado es peor que un error.
4. `generateCertificateCode` toma el prefijo de la fila del evento.
5. La ruta de subida a Nextcloud sale de `nextcloud_directorio`.
6. `public/regalos.html` y `public/certificados.js` deben mandar el
   `masterclass_codigo` del curso que se está reclamando.
7. Tests: emitir para dos cursos distintos y comprobar que cada PDF lleva su
   título, su duración, su fecha y su prefijo de código.

## Defecto latente que hay que arreglar sí o sí

`issue-certificate:648-654` busca la inscripción así:

```js
.from(REGISTRATIONS_TABLE).select('id,correo').eq('correo', email).maybeSingle()
```

Filtra solo por correo, sin mirar el curso. Eso trae dos problemas, y el segundo
es peor:

1. **Permisos**: alguien inscrito al taller A podría reclamar el certificado del
   curso B.
2. **Rotura directa**: el índice único de `eccia_taller_inscripciones` es sobre
   `(lower(btrim(correo)), taller_codigo)`, así que una persona inscrita a dos
   cursos tiene **dos filas con el mismo correo**. `maybeSingle()` devuelve error
   cuando la consulta trae más de una fila. La primera persona que se inscriba a
   dos cursos rompe la emisión para sí misma.

Hoy no se manifiesta porque solo hay una inscripción por correo. Se manifiesta
el día que alguien tome un segundo curso, que es exactamente lo que este plan
habilita. El arreglo es agregar `.eq('taller_codigo', <codigo del curso>)` a esa
consulta, no cambiar `maybeSingle()` por `limit(1)`: elegir una fila al azar
volvería a abrir el problema de permisos.
