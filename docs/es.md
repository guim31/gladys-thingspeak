# ThingSpeak

Esta integración lleva sus canales de [ThingSpeak](https://thingspeak.mathworks.com) a Gladys: cada canal se convierte en un dispositivo, cada campo con nombre en un sensor, con la fecha de la última entrada. Sus escenas también pueden escribir entradas en un canal, como la integración ThingSpeak de Home Assistant.

Probada con la API real de ThingSpeak (canales públicos 9, 12397 y 276330, canal privado leído sin su clave, corte de red). La escritura de entradas solo se ha probado con un servidor local simulado: sus comentarios son bienvenidos en [GitHub](https://github.com/guim31/gladys-thingspeak/issues).

## Lo que necesita

- Gladys 5.1 o posterior, con acceso a Internet.
- El número de cada canal que quiera seguir (**Channel ID** en la página del canal). Un canal público no necesita nada más.
- Para un canal privado, su **Read API Key** (página del canal, pestaña **API Keys**).
- Para escribir desde las escenas, la **Write API Key** del canal.

## Primeros pasos

### 1. Nombre sus campos con su unidad

ThingSpeak no tiene unidades. Gladys la lee al final del nombre del campo, entre paréntesis o corchetes, o tras un espacio: `Temperatura (°C)`, `Presión [hPa]`, `Humedad %`, `Potencia (W)`. Unidades reconocidas: °C, °F, %, hPa, mbar, Pa, kPa, bar, psi, lux, V, W, kW, A, kWh, ppm, m/s, km/h, mm/h, dB. Un campo en % cuyo nombre habla de humedad se convierte en un sensor de humedad, un campo en ppm cuyo nombre menciona CO2 en un sensor de CO2. Cualquier otro campo se convierte en un sensor genérico, sin unidad.

### 2. Configure la integración

- **Números de canal**: los números separados por comas, p. ej. `9, 12397` (20 como máximo). La dirección de un canal también sirve.
- **Claves API de lectura (canales privados)**: vacío para los canales públicos. Una clave para todos los canales, o pares `canal:CLAVE` separados por comas, p. ej. `1234567:ABCD1234EFGH5678`.
- **Clave API de escritura (opcional)**: la clave que usa la acción de escena cuando no tiene la suya.
- **Intervalo de actualización**: de 1 a 15 minutos, 2 por defecto. Una petición por canal y actualización.
- **Canal silencioso tras**: un canal sin entrada nueva durante este tiempo se considera silencioso (vea Escenas). **Nunca** desactiva la regla.
- **Idioma de los mensajes**: idioma de los nombres de funciones, de las variables de escena y de los errores.

**Probar la conexión** lee todos los canales al momento e indica cuántos canales y campos se han leído, o por qué un canal no se puede leer.

### 3. Añada los dispositivos

Abra la pestaña **Descubrir** de la integración y añada los canales que quiera. Un campo creado más tarde aparece tras **Actualizar** en la misma pestaña.

## Los dispositivos

- Un dispositivo por canal, con el nombre del canal. Una función por campo con nombre, más **Última entrada** (fecha y hora de la última entrada, en la zona horaria de Gladys).
- Un campo conserva el valor más reciente encontrado en las 100 últimas entradas. Un campo escrito con menos frecuencia recibe su último valor, pedido una vez y enviado una vez con su propia fecha, nunca como un valor reciente. Entre las 100 últimas entradas, un valor más antiguo que el plazo de silencio no se envía.
- Solo se envían a Gladys los cambios, y un valor sin cambios de nuevo cada 6 horas mientras el canal reciba entradas. Los valores de un canal silencioso ya no se envían: Gladys los muestra como antiguos en lugar de recientes.
- La latitud, la longitud y la altitud del canal se ignoran.

## Panel

El widget **Canales ThingSpeak**:

- sin dispositivo elegido, una fila por canal con el tiempo desde su última entrada, en naranja si está silencioso, en rojo si no se puede leer;
- con un dispositivo elegido, sus seis primeros campos como mosaicos en directo, y luego la fila de la última entrada. **Ocultar la fila de la última entrada** quita esa fila.

## Escenas

### Disparadores

**Canal ThingSpeak silencioso o de vuelta**: un canal no recibió entradas durante el plazo configurado (un sensor dejó de escribir), o vuelve a recibirlas. Filtros: el dispositivo, el cambio (silencioso, activo de nuevo). Variables: el canal, su número, el estado y los minutos desde la última entrada.

### Acciones

**Publicar en ThingSpeak**: escribe una entrada, con valores en **Campo 1** a **Campo 8** y el **Estado**. Los campos vacíos no se envían. Un valor puede venir de una acción anterior, por ejemplo una temperatura leída de otro dispositivo. La clave de escritura identifica el canal: deje vacío el campo de la clave para usar la de la configuración. Una coma decimal (`21,5`) se envía con punto. La acción devuelve el número de la entrada.

El plan gratuito acepta una entrada cada 15 segundos por canal: la integración espera cuando dos entradas se siguen demasiado de cerca, en lugar de que la segunda sea rechazada. Una cuarta entrada en espera con la misma clave se rechaza: superaría el tiempo límite de la acción.

### Ideas de escenas

- Cada 10 minutos, publicar la temperatura de un sensor de Gladys en un canal público para verla en un gráfico de ThingSpeak.
- Recibir un mensaje cuando el canal de su estación meteorológica lleve una hora silencioso.

## Solución de problemas

- **canal privado: clave API de lectura ausente o incorrecta**: añada la Read API Key de este canal.
- **ningún canal con este número**: compruebe el Channel ID.
- **ThingSpeak rechaza demasiadas peticiones**: elija un intervalo de actualización más largo.
- **ThingSpeak rechazó la entrada**: clave de escritura incorrecta, o entradas demasiado frecuentes para su plan.
- Registros: `LOG_LEVEL=debug` muestra cada lectura. Las claves API nunca aparecen en ellos.

## Límites

- Plan gratuito de ThingSpeak: una entrada cada 15 segundos por canal, 3 millones de mensajes al año. Las lecturas no están limitadas en número, pero conviene moderarlas: un minuto es el intervalo más corto propuesto.
- 8 campos por canal, 20 canales como máximo.
- Un campo que contiene texto no da ningún valor.
- Sin relación con MathWorks. ThingSpeak es una marca de The MathWorks, Inc.
