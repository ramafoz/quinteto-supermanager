# Acceso directo con ACB

Cada participante entra con su correo y contraseña ACB. El backend valida las credenciales contra ACB, obtiene el JWT SuperManager y consulta los equipos. La identidad local se vincula únicamente al atributo estable `UserData.UserAttributes[name=sub]` de la respuesta autenticada de ACB. Ni el correo escrito ni un JWT enviado por el navegador sirven como prueba de identidad. Si falta ese atributo, el acceso falla sin crear ni cambiar cuentas.

La primera entrada necesita el código de invitación de la liga. Se registra al participante automáticamente, con el apodo recibido de ACB. Las siguientes entradas reutilizan la misma cuenta aunque cambie el correo o el apodo. No se necesita Supabase ni envío de emails.

## Migración del administrador

Mientras mantiene su sesión anterior, entra en «A miña liga e conta» y completa «Activar o meu acceso con ACB» con la cuenta del equipo seleccionado. Se conserva su identificador interno, propiedad de la liga, snapshots y cifrado de tokens. No se reasigna una identidad ya vinculada a otra persona. Después puede entrar con ACB sin código de invitación. Existe recuperación transitoria para el administrador original mediante su cuenta anterior; los colegas no usan esa vía.

## Sesiones y acceso público

La pantalla de entrada puede ser pública, pero los endpoints de la liga exigen una sesión válida. El código de invitación no sustituye la autenticación ACB. Las reglas de privacidad antes de la jornada siguen aplicándose en el servidor.

Sesiones opacas aleatorias de 256 bits, duración máxima de 30 días, hash SHA-256 en D1 y cookie `__Host-quinteto`, Secure, HttpOnly, SameSite=Lax. Cerrar sesión invalida la sesión en D1. Se verifican origen y tamaño de las peticiones y se limita la frecuencia por IP y por identificador de acceso seudonimizado. Nunca se guardan contraseñas ni cuerpos de respuesta ACB. El JWT ACB sigue cifrado y caduca independientemente de la sesión local.

Pruebas automatizadas: identidad estable, convite obligatorio, errores ACB, ausencia de sub, migración preservando equipo, conflictos de vinculación, entradas simultáneas, expiración y cierre de sesión. Falta validar con una cuenta real el nuevo atributo de identidad; el login y la importación anteriores fueron confirmados por el usuario.
