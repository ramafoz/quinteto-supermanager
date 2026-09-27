# Cambios pendentes · aprobación por fases

O usuario revogou os permisos anteriores. O 27-09-2026 aprobou publicar a fase 1, aplicar a súa migración aditiva e actualizar GitHub tras superar as probas. As seguintes fases requiren nova aprobación.

## Fase 1 — axustes manuais (probada; publicación autorizada)
- [x] Eliminar os descontos automáticos de 25 puntos, tamén na xornada 1.
- [x] Axuste manual total por equipo/xornada, positivo, negativo ou cero; só administrador.
- [x] Conservar equipos, usuarios, sesións, declaracións e historial. Campo novo, sen borrar datos antigos.
- [x] Aplicar o axuste ás clasificacións de xornada e xeral.
- [x] Completar probas e revisión local: 44 probas, comprobación de tipos, compilación e gardado de −4 no navegador con resultado 203 → 207.
- [x] Aprobación explícita para publicar, aplicar a migración aditiva e actualizar GitHub: 27-09-2026.

## Fase 2a — catálogo de equivalencias (probado; publicación autorizada)
- [x] Incorporar as 31 equivalencias revisadas e aprobadas polo administrador.
- [x] Pantalla privada de revisión, filtros, correspondencias manuais e confirmación por lotes.
- [x] Botón «Actualizar catálogo», conservación de ausencias e control de actualizacións simultáneas.
- [x] Migración aditiva, 51 probas, tipos, compilación e comprobación no navegador local.
- [x] Publicación, migración remota e sincronización con GitHub autorizadas o 27-09-2026.
- [x] Consulta completa e equivalencias verificadas polo administrador.

Detalle: [CATALOGO-EQUIVALENCIAS.md](docs/CATALOGO-EQUIVALENCIAS.md).

## Fase 2b — fonte Rincón e lousa (probada; publicación autorizada)
- [x] Verificar lectura de puntuacións e prezos de https://www.rincondelmanager.com/ e correspondencia inequívoca con IDs ACB.
- [x] Distinguir puntos SuperManager de valoración sen bonus e prezos de apertura/peche por tempada e xornada.
- [x] Gardar datos válidos con hora e fonte; conservar o anterior ante erros ou datos ausentes.
- [x] Engadir Broker ao lado de Puntos ACB; abreviar clubs e retirar «Aposta única».
- [x] Revisar frecuencia e custo de actualizacións da nova fonte antes de activala.

Detalle: [FONTE-RINCON.md](docs/FONTE-RINCON.md). Fila laranxa clara cando o partido está en xogo. 61 probas, tipos, compilación e revisión visual superados. Publicación, migración aditiva e GitHub autorizados o 27-09-2026.

## Fase 3 — clasificación de broker (probada; publicación autorizada)
- [x] 5.000.000 € máis variacións do cadro final; acumulación entre xornadas confirmada polo administrador.
- [x] Clasificación de xornada e xeral, patrimonio provisional e datos pendentes.
- [x] Sen duplicar variacións en cada consulta; correccións anteriores actualizan o acumulado.
- [x] Posicións descoñecidas completadas con equivalencias Rincón: reparación dos cadros gardados e futuras importacións.
- [x] 66 probas, tipos, compilación e revisión visual. Ver [BROKER.md](docs/BROKER.md).

## Fase 4 — cálculo asistido do axuste (sen autorizar implementación)
- [ ] Propor suma(puntos novos − puntos anteriores) para cambios elixibles.
- [ ] Conservar edición manual, incluídos negativos; resolver cambios múltiples/revertidos e datos pendentes.
- [ ] Manter gratuítos os cambios anteriores á declaración inicial e fóra da xornada.

## Selección automática de xornada
- [x] Nas 24 horas previas selecciona a seguinte, se non hai unha xornada en curso. Respecta selección manual e non declara equipos. Antes desa xanela conserva a última disputada. Sen cambios de base de datos.
