# Vistas e actualizacións

- **Equipos e xornada**: comparación, filtro por plantilla, ordenación e vista por equipo. O filtro «Plantilla de…» limita as filas; conserva todas as columnas e as coincidencias. Antes do inicio só se entrega o cadro propio desde o servidor.
- **Clasificacións**: xornada seleccionada no selector superior ou xeral de xornadas rematadas. Pódese ordenar por puntos ACB ou por puntos tras penalizacións.
- A orde dos xogadores gárdase por usuario neste navegador: posto/nome ou coincidencias, ascendente/descendente.
- Despois da declaración inicial desaparece a súa caixa; segue visible o distintivo de declaración. Cada xornada ten a súa propia declaración.

## Puntuacións

O administrador vincula a xornada ACB e pode actualizar manualmente ou activar unha consulta inmediata e despois cada dous minutos. O temporizador permanece activo entre as vistas internas; para ao premer parar, cambiar de xornada, pechar/recargar a web, ao remate configurado ou ante un erro. Require sesión ACB vixente e navegador aberto; a suspensión do dispositivo ou as restricións do navegador poden atrasar consultas. Unha petición xa enviada pode finalizar despois de parar. O servidor rexeita consultas automáticas de xornadas rematadas e comproba o estado entre lotes de xogadores. A consulta manual segue dispoñible despois do final para recoller os resultados definitivos.

Cada ciclo reutiliza a importación existente: calendario e estatísticas dos xogadores distintos, con concorrencia limitada. Non é unha única petición a ACB nin cambia as plantillas.

A lousa mostra puntos ACB por xogador. Os totais en directo suman os puntos dispoñibles (incluíndo negativos); os datos ausentes aparecen como «—» e o total identifícase como parcial. A xeral exclúe resultados importados incompletos ata recibir todos os puntos ou unha corrección manual do administrador. Unha corrección manual conserva o detalle dos xogadores, prevalece como total e anula a marca de hora de importación do total. Unha nova consulta ACB pode substituír esa corrección.

Non se modificou o esquema da base de datos nin se migraron usuarios nesta actualización. A API interna de ACB segue sen contrato público: as probas usan respostas simuladas; a dispoñibilidade e actualización real dos resultados dependen de ACB.
