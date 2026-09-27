# Fase 1: axustes manuais por xornada

Probada e autorizada para publicación o 27-09-2026. Aplica tamén á xornada 1.

O administrador introduce o **axuste total a restar** en Clasificacións → Clasificación da xornada. Gardar substitúe o valor anterior, non o acumula. Pode introducir positivos, negativos ou cero (ata dous decimais, entre −10000 e 10000).

- Novo 20, anterior 8: axuste 12; 203 puntos ACB pasan a 191.
- Novo −4, anterior 0: axuste −4; 203 puntos ACB pasan a 207.
- Varios cambios: sumar as diferenzas dos cambios elixibles e gardar ese total.

Só se admiten axustes para un equipo declarado nunha xornada xa iniciada, tamén se rematou. O administrador revisa que só inclúan cambios posteriores á declaración e dentro da xornada. O sistema aínda non calcula a diferenza automaticamente. As importacións posteriores conservan o axuste e non engaden descontos.

Migración 0006: engade `manual_penalty` cun valor inicial cero. Non reescribe os valores antigos de `penalty_reduction`, os recontos nin os históricos; estes deixan de determinar a penalización. Non se converten descontos antigos, de acordo coa confirmación do usuario de que non se aplicou ningún. O historial deixa de mostrar os antigos importes de 25 puntos como cargos activos.

O usuario aprobou expresamente a publicación, a migración e a actualización de GitHub o 27-09-2026. A fonte de puntos segue sendo ACB nesta fase. O broker e a nova fonte quedan no TODO.
