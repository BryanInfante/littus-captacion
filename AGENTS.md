# AGENTS.md — proyecto ECCIA

## Marca obligatoria

brand_id: `eccia`

Este proyecto usa el Littus Brand Kit.

Antes de realizar cualquier cambio de frontend, UI, CSS, HTML, layout, componentes visuales, logos, colores, tipografía, landing page, formulario o dashboard:

1. Resuelve la variable de entorno `LITTUS_BRAND_KIT`.
2. Comprueba que existe `brands/eccia/manifest.json` dentro de esa ruta.
3. Si la variable no existe o la marca no está disponible, detente y reporta el problema. No adivines rutas ni valores de marca.
4. Lee, en este orden:
   - `agents/brand-applicator.md`
   - `STEERING.md`
   - `brands/eccia/manifest.json`
   - `brands/eccia/BRAND.md`
   - `brands/eccia/tokens.json`
   - `brands/eccia/components.css` cuando necesites referencias visuales.
5. Aplica la marca sin modificar reglas de negocio ni backend salvo que la tarea lo solicite de forma explícita.
6. No inventes colores, logos, tipografías, slogans ni contenido comercial.
7. Cuando el proyecto requiera archivos físicos de marca, usa `apply-brand.ps1` o `apply-brand.sh` si el entorno lo permite. Si no, sincroniza los recursos necesarios de forma manual y equivalente.

## Confirmación antes de cambios visuales

Antes de empezar una tarea visual, indica brevemente:

- brand_id aplicado;
- ruta resuelta desde `LITTUS_BRAND_KIT`;
- archivos de marca leídos;
- si el proyecto ya tiene tokens, componentes y assets disponibles.
