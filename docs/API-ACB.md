Estado histórico anterior á fase 1. A nova regra preparada en local descríbese en [AXUSTES-MANUAIS.md](AXUSTES-MANUAIS.md); substitúe as referencias a descontos de 25 puntos deste documento. Publicación autorizada o 27-09-2026.

Actualización: véxase [PUNTUACIONS-E-REXISTRO.md](PUNTUACIONS-E-REXISTRO.md) para o contrato das estatísticas por xogador e xornada e a nova regra de declaración.

# Contrato ACB y comprobaciones pendientes

Verificado en el código público de referencia el 25-09-2026; NO se ha realizado un login con credenciales reales. Las pruebas del adaptador usan respuestas simuladas.

Incidencia de despliegue corregida: el runtime Workers instalado rechaza `redirect: error` antes de efectuar la petición. El adaptador usa `manual` y rechaza explícitamente las respuestas 3xx, sin reenviar credenciales. `tests/acb-worker.test.mjs` ejecuta el adaptador en el runtime real con transporte simulado y comprueba tanto el intercambio como el bloqueo de redirecciones. El acceso con una cuenta ACB real sigue pendiente de validación por el usuario.

## Login implementado

1. `POST https://id.acb.com/api/signIn`, `Content-Type: application/x-www-form-urlencoded`, campos `username` y `password`.
2. De la respuesta se toma `code`.
3. `POST https://supermanager.acb.com/oauth/V2/open/accounttoken/getTokens`, JSON `{ "uuid": "<code>", "deviceId": "" }`.
4. Se exige `jwt` no vacío y `type: Bearer`. El usuario confirmó también `refresh`; esta versión lo descarta porque no está verificado el contrato de renovación.
5. `GET https://supermanager.acb.com/api/basic/userteam/all`, Bearer JWT. El código de referencia describe un array de competiciones con `userTeamList`, cuyos elementos tienen `idUserTeam` y `nameTeam`. Se agrupan las competiciones y se deduplican equipos por ID.
6. `GET https://supermanager.acb.com/api/basic/userteamplayer/{idUserTeam}`, Bearer JWT. Se espera un array con `idPlayer`, `shortName` y opcional `statusTeamSquad`. Se omiten plazas `empty` y se exigen exactamente diez IDs distintos. No se sobrescribe la plantilla ante respuestas incompletas o incompatibles.

Fuentes de implementación:

- [AcbAuthenticationAdapter.java](https://github.com/amupoti/supermanager/blob/master/supermanager-acb-parser/src/main/java/org/amupoti/supermanager/acb/adapter/out/acbapi/AcbAuthenticationAdapter.java)
- [LoginRequest.java](https://github.com/amupoti/supermanager/blob/master/supermanager-acb-parser/src/main/java/org/amupoti/supermanager/acb/adapter/out/acbapi/dto/LoginRequest.java)
- [AcbTeamDataAdapter.java](https://github.com/amupoti/supermanager/blob/master/supermanager-acb-parser/src/main/java/org/amupoti/supermanager/acb/adapter/out/acbapi/AcbTeamDataAdapter.java)
- [TeamPlayerDetailResponse.java](https://github.com/amupoti/supermanager/blob/master/supermanager-acb-parser/src/main/java/org/amupoti/supermanager/acb/adapter/out/acbapi/dto/TeamPlayerDetailResponse.java)

## Pendiente de comprobar con una cuenta real

- Vigencia de los cuerpos de login, posibles requisitos de dispositivo, cookies, CAPTCHA o MFA. No se evaden esos requisitos.
- Envelope real de equipos, competiciones actuales y contenido de la plantilla de diez jugadores. El parser falla explícitamente si el formato no coincide.
- Valores de posición: se muestran como «Jugador» cuando no se recibe un nombre de posición conocido. No se ha inventado una correspondencia numérica.
- Endpoint, cuerpo, rotación, caducidad y revocación de `refresh`. Su mera existencia no garantiza renovación desatendida.
- TTL efectivo del JWT. `exp` se usa solo para anticipar caducidad; nunca como prueba de identidad. Retención local máxima de 24 horas, una hora si el token es opaco.
- Límites de frecuencia y aceptación de peticiones desde el servidor alojado. CORS no condiciona el diseño porque las llamadas a ACB son servidor a servidor.
- Historial autoritativo de cambios y su timestamp. La API actual solo informa del estado presente: puede perder sustituciones hechas y deshechas entre consultas, y no permite fechar las diferencias entre la última consulta previa y la primera posterior: quedan pendientes de revisión sin descuento automático.
- Fuente automática de puntuación ACB. El administrador introduce la puntuación ACB; el resultado de liga se calcula como puntos ACB menos 25 por sustitución penalizada de esa jornada.

## Validación manual sin compartir secretos

Entrar en la miniweb, crear una liga y una jornada futura, conectar ACB desde su formulario, seleccionar equipo y confirmar los diez jugadores. Después probar desvinculación y reconexión. Si falla, basta con indicar el mensaje mostrado y, si se requiere ajustar el contrato, los nombres de los campos de una respuesta anonimizada. No enviar contraseñas, JWT, refresh, cookies ni archivos HAR con credenciales.

## Reglas de jornada acordadas

- Antes del inicio, cada usuario solo recibe su propia plantilla en la API. No hay coincidencias ni diferenciales ajenos.
- Desde el inicio, las plantillas se revelan y continúan actualizándose.
- Una sustitución equivale a un jugador entrante respecto a la última plantilla importada; resta 25 puntos. Dos entrantes restan 50. Reimportar lo mismo no penaliza; volver a un jugador anterior sí cuenta si ambos estados se observaron.
- Se mantiene una referencia previa al inicio. Si falta, la penalización total queda pendiente de revisión y solo se muestran los cambios posteriormente observados.
- No se permite cambiar de equipo SuperManager durante una jornada ya iniciada si existe una plantilla registrada. Sí se permiten cambios de jugadores dentro de ese equipo.
- El creador finaliza la jornada después de los partidos. Entonces dejan de admitirse importaciones y puede abrirse otra.
- Este MVP no es un árbitro infalible de todos los cambios: para garantizar 25 puntos por **cada** sustitución real hace falta verificar un historial ACB o registrar obligatoriamente todos los cambios por otra vía. La interfaz lo indica como penalización detectada.

**Regla temporal estricta:** antes del inicio no hay penalización. Se cobra entre inicio y final de la jornada, a partir de la referencia declarada por honor o de observaciones posteriores al inicio. Las diferencias que cruzan el inicio se anotan como pendientes con 0 puntos hasta verificar su hora; este MVP no incorpora todavía resolución manual de esos pendientes.

## Ampliaciones acordadas

La declaración de honor acepta el equipo inicial incluso tras comenzar la jornada, una vez por usuario y jornada, sin borrar penalizaciones contabilizadas. ends_at delimita el final; entre jornadas los cambios son gratuitos. La puntuación neta de cada jornada es independiente: 203 − 2 × 25 = 153.

El cupo exige al menos dos jugadores mezclables entre Río Breogán, Leyma Coruña y Obradoiro. Se consulta GET /api/basic/player con filtros competition.idCompetition=1 y edition.isActive=true, _page=1, _perPage=300. El mercado devuelve idPlayer y nameTeam según [MarketPlayerResponse](https://github.com/amupoti/supermanager/blob/master/supermanager-acb-parser/src/main/java/org/amupoti/supermanager/acb/adapter/out/acbapi/dto/MarketPlayerResponse.java) y [AcbMarketDataAdapter](https://github.com/amupoti/supermanager/blob/master/supermanager-acb-parser/src/main/java/org/amupoti/supermanager/acb/adapter/out/acbapi/AcbMarketDataAdapter.java). Contrato no probado en vivo: comprobar nombres, disponibilidad de jugadores y paginación. El cupo inicial no validado impide registrar; incumplimientos posteriores se conservan como observaciones para auditar cambios, sin validar su clasificación.
