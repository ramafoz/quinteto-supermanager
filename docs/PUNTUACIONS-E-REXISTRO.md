Estado histórico anterior á fase 1. A nova regra preparada en local descríbese en [AXUSTES-MANUAIS.md](AXUSTES-MANUAIS.md); substitúe as referencias a descontos de 25 puntos deste documento. Publicación autorizada o 27-09-2026.

# Puntuacións, declaracións e rexistro

## Puntuacións ACB

O administrador escolle a xornada ACB e preme «Actualizar puntuacións» na clasificación da xornada, unha vez iniciada. Consultamos os xogadores dos cadros gardados, sen reimportar equipos, e conservamos os valores por xogador, a hora e o total. Os puntos individuais vense en «Por equipo».

Fonte verificada no JavaScript público oficial o 26-09-2026: https://supermanager.acb.com/main.c1db7d2fbe0cbd2be9ab.js

- GET /api/basic/journey/competition/1 → primeiro grupo, journeyList, idJourney e number.
- GET /api/basic/playerstats/1/{idPlayer} → playerStats por numberJourney, pointsJourney e bonusVictory.
- A gráfica oficial usa bonusVictory cando é distinto de cero; se é cero, pointsJourney. Non sumamos ambos para evitar duplicar o bonus.
- Requírese unha sesión ACB vixente do administrador. Non usamos contrasinais gardados.
- Non é un fluxo continuo: obtéñense os últimos datos publicados por ACB ao premer. As filas ausentes ou sen puntos quedan pendentes, nunca se interpretan como cero.
- Se faltan puntos, gardamos o detalle recibido e conservamos o total anterior. Se falla unha consulta ou cambia o formato, non sobrescribimos puntuacións.
- A vinculación usa o identificador da xornada, comprobado contra o calendario actual, ademais do número; non se infire do nome escrito polo administrador.
- O contrato está contrastado co código oficial e con respostas simuladas. Falta verificar a primeira consulta autenticada real das estatísticas nesta versión. O acceso ACB e a importación de equipos xa estaban en uso.

## Penalizacións

Só se contabilizan substitucións tras a declaración explícita de equipo inicial e durante a xornada. Declarar por primeira vez tarde é válido; non penalizamos o anterior. A declaración é única. Unha diferenza que cruza o inicio sen hora comprobable non se cobra automaticamente.

O administrador pode reducir ou anular os puntos propostos. Gardamos a redución separada do reconto: novos cambios posteriores engaden novas penalizacións. Os axustes repercuten na xornada e no acumulado. Os antigos recontos sen declaración mantéñense na base pero deixan de descontar.

O estado «Equipo inicial declarado» é público dentro da liga, mesmo antes do inicio. Non dá acceso á plantilla oculta.

## Rexistro privado

Só o dono da liga pode consultar o rexistro, con paxinación. Garda data/hora, usuario e unha mensaxe curta. Rexistra accesos correctos, ping periódico coa páxina visible, actualizacións manuais/automáticas, cantidade de cambios, declaracións e axustes. Non garda credenciais, IPs, nomes nin IDs dos xogadores no rexistro.

Unha caché privada de IDs da última observación permite detectar diferenzas entre consultas, tamén antes e despois das xornadas. A comparación posterior co equipo inicial é só un aviso: non altera o cadro histórico nin cobra cambios entre semanas. Non podemos detectar movementos feitos e desfeitos entre dúas consultas.

Non hai consultas cando todas as páxinas están pechadas; a observación automática segue cada cinco minutos coa web aberta e conexión ACB vixente. O rexistro empeza nesta versión; non se inventa actividade pasada.

## Actualización de datos

Migración 0005 aditiva: novas táboas e columnas con valores por defecto. Non borra nin reconstrúe contas, sesións, ligas ou equipos existentes. Proba de migración cunha liga con catro participantes e datos previos.
