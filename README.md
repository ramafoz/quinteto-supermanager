# Revisión pública de Quinteto

Código da miniweb dunha liga privada SuperManager ACB. Esta copia permite revisar as regras, o acceso aos datos e as probas.

Exportación da versión publicada do 27-09-2026, commit de orixe 306b034efc412812e66181fa75c3504f9d659be0. O código da aplicación é o mesmo; a configuración pública omite o identificador do despregamento. Non inclúe a base de datos, contas reais, tokens, segredos nin rexistros de actividade. Conserva o historial público anterior.

Puntos para revisar:
- server/service.ts: autorización, declaración inicial e penalizacións.
- server/scoring.ts e server/acb.ts: puntuacións ACB.
- server/audit.ts: rexistro privado do administrador.
- server/catalog.ts e components/catalog-review.tsx: revisión privada do catálogo.
- tests/: 51 probas, incluída a migración que conserva datos previos.
- docs/AXUSTES-MANUAIS.md e TODO.md: axustes manuais e fases pendentes.

Para executar as probas: Node.js 24, npm ci e node --test tests/*.test.mjs. Para a configuración local e os límites da integración ACB, véxase a documentación orixinal máis abaixo. A comprobación autenticada real das novas estatísticas segue pendente.

Esta é unha copia pública para revisión, sen sincronización automática co servizo publicado. As licenzas de dependencias e compoñentes de terceiros consérvanse nos ficheiros correspondentes.

---

# Quinteto — liga privada de SuperManager ACB

MVP con React, Vite/Vinext, backend HTTP y SQLite (Cloudflare D1). Acceso directo con ACB y código de invitación a la liga, sin cuenta ChatGPT para los participantes. Ver [acceso y migración](docs/ACCESO.md).

Ver tamén [puntuacións ACB, revisión de penalizacións e rexistro privado](docs/PUNTUACIONS-E-REXISTRO.md).

## Reglas implementadas

- Antes del inicio, cada usuario solo recibe su propia plantilla. Se ocultan coincidencias, diferenciales y clasificación. La restricción se aplica en el servidor.
- Cambios gratuitos antes de la jornada y entre jornadas. Cada jornada tiene inicio y final configurados por el creador.
- Ajuste manual por jornada: suma de puntos de jugadores nuevos menos anteriores, solo tras la declaración y durante la jornada. El administrador guarda el total con signo; las importaciones no añaden descuentos automáticos. Ver docs/AXUSTES-MANUAIS.md (fase probada y autorizada para publicación el 27-09-2026).
- Declaración de honor «Este era mi equipo al inicio de la jornada», incluso registrándolo después. Se acepta la plantilla actual como referencia. Una declaración por jornada; los cambios anteriores a la primera declaración nunca penalizan.
- Sin declaración, una diferencia entre una consulta anterior y otra posterior al inicio queda pendiente, sin descuento automático, porque no conocemos su hora real.
- Clasificación por jornada: puntos ACB menos penalización. Ejemplo con ajuste manual −4: 203 − (−4) = 207. Las penalizaciones no se arrastran a la siguiente jornada.
- Mínimo dos jugadores en total entre Río Breogán, Leyma Coruña y Obradoiro, mezclables. Una plantilla inicial que no cumple o no puede verificarse no se acepta. Si una plantilla ya observada incumple después, se conserva para no perder el historial, pero queda sin validar en clasificación. No se inventa otra sanción en puntos.
- Final automático según horario o anticipado por el creador. Después no se actualiza la plantilla de esa jornada. Se puede abrir la siguiente con un contador de cambios nuevo.

## Uso

1. Entrar, crear la liga o usar una invitación.
2. El creador programa inicio y final de la jornada.
3. Cada participante conecta ACB, selecciona su equipo y lo importa.
4. Si lo registra tarde, marca la declaración de equipo inicial y pulsa «Actualizar mi plantilla».
5. Tras el inicio se revelan las plantillas. La página actualiza cada cinco minutos mientras está abierta y la sesión es válida; también admite actualización manual.
6. Al terminar, el creador introduce los puntos ACB en «Clasificación». El total neto se calcula automáticamente. La obtención automática de puntos ACB aún no está verificada.

## Implementado y pendiente

El usuario confirmó el funcionamiento de la conexión ACB anterior. La nueva vinculación por identificador estable debe validarse al migrar su cuenta. Se apoya en los endpoints confirmados por el usuario y el código público de referencia. Ver [contrato y pendientes](docs/API-ACB.md).

La contraseña solo se usa para iniciar sesión y se descarta; no se guarda ni registra. El JWT se cifra con AES-256-GCM, nonce aleatorio y usuario como dato autenticado; nunca se envía al navegador. El refresh se descarta porque su contrato de renovación no está verificado. Al caducar la sesión se solicita reconexión. Retención máxima del JWT: 24 horas (una hora si no hay exp legible).

No hay actualización desatendida con la web cerrada. La API actual da la plantilla presente: no descubre cambios hechos y deshechos entre consultas. La declaración de honor resuelve la referencia inicial, pero no crea un historial ACB autoritativo. El administrador puede reducir o anular los descuentos desde la clasificación de la jornada.

La consulta de mercado aporta el club de cada jugador. Los nombres se normalizan mediante una lista explícita de alias; los clubes desconocidos no se inventan. La primera página de mercado admite hasta 300 jugadores; IDs ausentes pueden requerir comprobar paginación. La regla nunca falla silenciosamente como «válida» si no hay dos jugadores identificados de los clubes permitidos.

## Arquitectura

- app/league-app.tsx: interfaz, cuenta, jornadas y actualización.
- app/api/league/route.ts: identidad, origen/CSRF, límite de cuerpo y respuestas sin caché.
- server/service.ts: autorización, ligas, referencias, snapshots y penalizaciones.
- server/acb.ts: login, equipos, plantilla y enriquecimiento con club.
- server/crypto.ts: cifrado por usuario.
- lib/quota.ts y lib/model.ts: cupo y comparación por ID.
- components/standings.tsx: clasificación y entrada manual de puntos ACB.
- db/schema.ts y drizzle/: SQLite y migraciones.

Tablas: leagues, members, acb_links, rounds, snapshots, rate_limits. Una liga por usuario. Invitaciones aleatorias de 128 bits, almacenadas como hash y rotables. La API solo permite al creador gestionar jornadas, invitaciones y puntuaciones. No se ejecutan compras ni ventas en ACB.

El nombre SQL rounds.lock_at significa inicio/revelación. ends_at es el final programado; closed_at permite cierre anticipado. snapshots contiene baseline_json, players_json, declared_at, changes_count, history_json y raw_points. Las escrituras condicionales comprueban jornada, vínculo y versión anterior para evitar doble penalización por concurrencia.

## Desarrollo local

Node.js 24 LTS recomendado (las pruebas usan TypeScript y SQLite integrados). Instalar dependencias con npm ci. Crear .env y .dev.vars a partir de .env.example y poner la misma clave local en ambos; generar una clave con:

    node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

Compilar con npm run build. Aplicar una sola vez y en orden las migraciones de drizzle/ mediante:

    node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/NOMBRE.sql

Iniciar con npm run dev. El login local simula seedy@sites.test solo en loopback. No exponer el servidor de desarrollo a Internet. SQLite local vive en .wrangler/state; secretos y estado local se excluyen de Git y del paquete publicado. Producción usa Sites, DB y TOKEN_ENCRYPTION_KEY como secreto. Cambiar la clave obliga a reconectar las cuentas existentes.

Verificación:

    node --test tests/core.test.mjs
    node node_modules/typescript/bin/tsc --noEmit
    npm run build

Pruebas automáticas con SQLite real en memoria y ACB simulado: login, cifrado, propiedad, aislamiento, privacidad, cupo, cambios gratuitos, honor, penalización por jornada, concurrencia y clasificación. Vista previa comprobada y filtros revisados; WebMCP de lectura valida entradas. El acceso e importación ACB fueron verificados por el usuario. La primera consulta real autenticada de puntuaciones sigue pendiente; el contrato se contrastó con el código oficial y fixtures.
