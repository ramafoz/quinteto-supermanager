Corrección de alcance autorizada: só se mostran e gardan xogadores dos cadros da propia liga, incluídos equipos iniciais e historial de substitucións de todas as xornadas gardadas. As fontes poden consultarse completas para localizar correspondencias, pero os xogadores alleos á liga non se presentan como tarefas de revisión. Un catálogo completo gardado anteriormente fíltase ao lelo e queda reducido na seguinte actualización correcta. Non cambia equipos nin puntos.

# Revisión do catálogo · probada e autorizada para publicación

Autorizada a preparación local polo administrador tras revisar as 31 equivalencias. Publicación, migración remota e sincronización de GitHub autorizadas o 27-09-2026.

## Uso

En «A miña liga e conta», o administrador dispón de «Catálogo de xogadores».

1. «Ver catálogo» abre as equivalencias gardadas. As 31 revisadas están confirmadas desde o inicio.
2. «Actualizar catálogo» consulta o mercado ACB coa conexión do administrador e o broker público de Rincón. Non precisa conta de Rincón. Non cambia puntos nin equipos.
3. Filtra por nome, club, ID ou estado: confirmada, nova proposta, con cambios, ausente ou por resolver.
4. Revisa unha correspondencia ou un lote de ata 50 propostas inequívocas; a pantalla mostra os nomes antes de «Confirmar equivalencias».
5. Repite a consulta aproximadamente cada semana. A pantalla indica a última consulta e avisa cando pasan sete días; non hai chamadas programadas nesta fase.

As ausencias consérvanse e non significan unha baixa definitiva. Unha equivalencia confirmada non se substitúe automaticamente se cambia o nome, club ou posto. Non se permite vincular dúas IDs ACB á mesma referencia de Rincón. O catálogo só é accesible ao administrador, tamén na API.

## Fontes e límites

- Rincón: `https://www.rincondelmanager.com/smgr/broker.php`, nomes completos e abreviados, club, posto e referencia da ficha. O título debe identificar 2026/27.
- ACB: `/api/basic/player`, competición 1 e edición activa, páxinas de 300. Non hai comprobación directa dunha etiqueta de tempada ACB: esíxense tamén polo menos cinco identidades coincidentes coas equivalencias revisadas.
- A lectura autenticada do catálogo ACB completo segue pendente de verificar coa sesión real tras autorizar a publicación. As probas usan respostas simuladas. Un formato inesperado, outra tempada, duplicados, erros de rede ou unha caída moi grande no número de xogadores conservan o catálogo previo.
- O recoñecemento automático é conservador: nome completo ou abreviado normalizado e mesmo club. Os casos ambiguos requiren escolla manual. Non hai emparellamento aproximado por apelidos.
- Só se prepara o catálogo. As puntuacións continúan coa fonte ACB actual; a lectura de puntos/broker de Rincón require outra fase.

## Persistencia e validación

Migración aditiva `0007_league_catalog.sql`: unha táboa independente por liga/tempada para observacións, equivalencias e historial de confirmacións. Non altera filas existentes de usuarios, equipos, sesións, declaracións ou puntos. A revisión controla a versión para evitar sobrescribir cambios doutra pestana. O rexistro xeral só recibe cantidades; os nomes da revisión quedan no catálogo privado.

Validación: 51 probas automatizadas aprobadas, tipos e compilación correctos. Proba local de navegador: carga, filtro de novas propostas, confirmación e persistencia, aviso de reconexión sen perder datos. Migración comprobada preservando os catro participantes dunha base de proba. Comprobación autenticada do catálogo completo pendente da primeira consulta do administrador.
