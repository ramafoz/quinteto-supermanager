# Puntuacións e broker de Rincón · fase 2b

Só o administrador actualiza. A consulta utiliza as equivalencias confirmadas da liga e dúas páxinas públicas, compartidas por todos os xogadores: `https://www.rincondelmanager.com/smgr/directo.php` e `https://www.rincondelmanager.com/smgr/broker.php`. Non envía credenciais ACB a Rincón.

## Datos

- Puntos ACB: columna SM, co bonus incluído; a valoración sen bonus gárdase por separado.
- Broker: prezo de apertura da xornada máis a variación publicada no directo. Indícase prezo inicial, provisional ou ao rematar o partido. Non representa aínda o patrimonio do equipo nin a caixa.
- En xogo: toda a fila da lousa aparece en laranxa claro cando a fonte indica minutos de partido. Un partido pendente non activa esa cor.
- Gárdanse fonte, tempada, número de xornada e hora da consulta. A ausencia dunha puntuación non se converte en cero; consérvase o dato anterior marcado como tal. Un erro da fonte conserva todos os datos previos.

## Xornadas e actualización

A primeira consulta válida vincula o número de xornada. Valídanse a tempada 2026/27 e o mesmo número nas dúas páxinas. A fonte consultada mostra a xornada corrente: cando pase á seguinte, non se pode volver consultar unha anterior con este mecanismo. Os datos xa gardados seguen dispoñibles. Non se implementaron parámetros históricos sen verificar.

O botón manual segue dispoñible tras o peche para a consulta final mentres a fonte mostre esa xornada. As actualizacións automáticas fan dúas peticións cada dous minutos coa pantalla aberta, e paran ao rematar ou pechar a xornada. Un control compartido evita duplicar consultas automáticas entre pestanas. Un erro detén o ciclo e avisa ao administrador.

Os totais completos actualízanse sen tocar os axustes manuais. Con datos ausentes ou anteriores, móstrase un total parcial. Non se modifican as declaracións iniciais, a privacidade dos cadros ou o catálogo confirmado. A migración 0008 só engade tres campos anulables ás xornadas.

## Verificación local

61 probas superadas, comprobación de tipos e compilación. Inclúe fonte incorrecta, xornada distinta, datos ausentes, valores negativos/cero, permisos, actualización simultánea de cadros/equivalencias, parada automática e conservación dos axustes.

Publicación e migración aditiva autorizadas polo administrador o 27-09-2026.
