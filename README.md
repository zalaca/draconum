# Efemérides Olvidadas

Una página web de página única (HTML/CSS/JS) que muestra una efeméride histórica cada día, con una estética de pergamino náutico.

## Cómo funciona

- El frontend consulta directamente la API REST de Supabase (`/rest/v1/chronicles`).
- Solo se devuelven crónicas con `event_date <= hoy`, así nunca se filtran datos del futuro.
- La navegación (`Anterior` / `Siguiente`) permite recorrer el archivo histórico, pero no se puede avanzar más allá de la fecha de hoy.

## Base de datos (Supabase)

Tabla `chronicles`:

| Columna       | Tipo     | Descripción                          |
|---------------|----------|---------------------------------------|
| `id`          | int      | Identificador autoincremental         |
| `category`    | text     | Categoría temática                    |
| `title`       | text     | Titular de la efeméride               |
| `body`        | text     | Texto completo (admite `<em>` para resaltar) |
| `source`      | text     | Fuente / referencia                   |
| `active`      | boolean  | Si se debe mostrar o no               |
| `event_date`  | date     | Fecha en la que debe aparecer         |

## Despliegue

1. Sube este repositorio a GitHub.
2. Conecta el repo a [Netlify](https://app.netlify.com) ("Import from Git").
3. (Opcional) Activa protección por contraseña en Netlify (Site settings → Visitor access).
4. Apunta tu dominio personalizado desde Porkbun a Netlify.

## Añadir más efemérides

Inserta filas nuevas en la tabla `chronicles` de Supabase con una `event_date` futura. La web las mostrará automáticamente cuando llegue el día.
