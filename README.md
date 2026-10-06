# WEST IA Web

Aplicación web interna (backoffice) para la gestión de mantenimiento de la flota de West Rent a Car.
Es la versión web de **WEST IA** de escritorio, con diseño moderno, modo oscuro y claro, y todo en español (Chile).

> **Versión de demostración.** Todos los datos (patentes, clientes, responsables, montos) son **ficticios**.
> La aplicación aún no está conectada a SAP ni a la base de datos de WEST IA.

## Cómo abrirla

**Doble clic en `INICIAR_WEST_IA_WEB.bat`.** La primera vez instala lo necesario (requiere internet y [Node.js](https://nodejs.org)); después abre el navegador en `http://localhost:5173`.

En la pantalla de ingreso basta con presionar **Ingresar** (los datos ya vienen completos).

Desde una terminal:

```bash
npm install      # solo la primera vez
npm run dev      # modo desarrollo en http://localhost:5173
npm run build    # versión final optimizada en la carpeta dist/
npm run preview  # sirve la versión final en http://localhost:4173
npm run lint     # revisión del código
```

## Presentación de ingreso

La pantalla de ingreso es una presentación 3D guiada por el desplazamiento: una Toyota Hilux 2024 plateada (parrilla de panal, focos LED, barra deportiva, llantas de 6 rayos) modelada por código con three.js, en seis cuadros: portada, vista desde arriba, datos de la flota, Flota · Taller · Gastos, "cada kilómetro bajo control" y el formulario. Arrastrando se gira la camioneta. Los botones **Ingresar** y **Saltar intro** van directo al formulario, y quien ya la vio entra directo al formulario las siguientes veces. Respeta la preferencia de "reducir movimiento" del sistema. Por defecto se muestra el modelo **Toyota Hilux BEV 2026 de ROH3D** con el visor oficial de Sketchfab (sin descargarlo; la cámara del visor sigue la misma coreografía). Si Sketchfab no carga, aparece la camioneta modelada por código. Para usar un **modelo 3D propio** de la Hilux, copie un archivo `hilux.glb` en `public/models/` (instrucciones en `public/models/LEEME.txt`); reemplaza automáticamente a la camioneta modelada por código. Código en `src/components/login/` (`hilux.js` modela la camioneta; `HiluxShowcase.jsx` la escena y los textos).

## Pantallas

| Pantalla | Qué muestra |
|---|---|
| Panel principal | Disponibilidad, unidades disponibles, ingresos y liberaciones de hoy, gasto, mapa de sucursales, uso de flota, gasto de 12 meses, flota por categoría y agenda del día |
| Control OT abiertas | Tabla y **tablero** (arrastrar tarjetas cambia el estado real), filtros, indicadores que filtran al hacer clic, panel de gestión por OT y exportación CSV |
| Flota | Tabla con filtros por categoría, estado, transmisión y combustible, búsqueda, orden y paginación |
| Expediente (Flota → patente) | Ficha del vehículo, OT abierta, indicadores, historial de órdenes con detalle de repuestos, mantenciones, daños y vencimiento de documentos |
| Visitas a sucursal | Visitas con comparación contra la visita anterior (nuevas, continúan, liberadas), unidades detenidas sin OT y cierre de visita |
| Control de Gastos | Correctivo, preventivo, a cobro, RAC y LOP; evolución mensual; recuperabilidad editable en la tabla |
| Salud e Inteligencia | Índice de salud, distribución operativa, componentes con más gasto, costo por km y recurrencia de fallas |
| Analista Técnico | Preguntas en lenguaje natural sobre la flota (motor local de demostración) |
| Reportes | Ocupación, gasto por sucursal y categoría, días en taller y costo por vehículo, con filtro de fechas y CSV |

Encabezado: selector de sucursal (filtra toda la aplicación), buscador global (patente, N° de OT o cliente; atajo `/`), alertas y cambio de tema.

## Importar la flota desde Excel

En **Flota → Importar Excel**:

1. Arrastre el archivo `.xlsx` (o use **Descargar plantilla** para partir de un formato listo, con instrucciones).
2. La aplicación busca sola la hoja y la fila de encabezados (aunque haya títulos arriba) e ignora hojas de OT.
3. Reconoce los mismos nombres de columna que el importador SAP de WEST IA de escritorio: Patente / PPU, Marca o Marca/Estilo, Modelo, Año fabricación, Kms, Faena / Sucursal, Chasis / VIN, Estado, Cliente, Combustible, Centro de costo… Solo **Patente** es obligatoria.
4. Vista previa antes de cargar: vehículos nuevos, actualizados y sin cambios, avisos por fila (patente con formato raro, año o kilometraje inválido, estado o sucursal no reconocidos, patentes repetidas) y columnas detectadas, que se pueden corregir a mano.
5. Elija **Actualizar y agregar** (no borra nada) o **Reemplazar la flota completa**.

**Exportar Excel** genera un archivo con el mismo formato, que se puede editar y volver a importar. La flota importada se guarda en el navegador; el aviso verde en Flota permite volver a los datos de demostración.

## Estructura

```
src/
  components/
    layout/   menú lateral, encabezado y marco general
    ui/       tarjetas, indicadores, botones, campos, tabla, ventanas
    charts/   mapa de sucursales y tooltip de gráficos
    ot/       panel de gestión y tablero de OT
    fleet/    ventana de importación de flota
  context/    tema, menú, sucursal elegida y usuario
  data/       catálogos, datos ficticios y capa de acceso (api.js)
  hooks/      useData (datos reactivos) y useCountUp (números animados)
  lib/        formatos CLP/km/fechas, CSV, Excel de flota (fleetExcel.js) y motor del Analista
  pages/      una página por pantalla
```

## Conectar con WEST IA real

Las pantallas solo usan las funciones de `src/data/api.js`. Para pasar a datos reales:

1. Exponer en el puente de WEST IA de escritorio (`api_bridge.py`, FastAPI) endpoints equivalentes:
   flota (`sap_fleet`), OT (`sap_work_orders` + `sap_ot_lines`), gestión (`open_ot_management`), gastos y visitas (`branch_visits`).
2. Reemplazar el cuerpo de cada función de `api.js` por la llamada al endpoint, manteniendo la misma forma de datos.
3. Eliminar `src/data/generate.js`.

Los valores de estado real, prioridad, bloqueo y tipo de intervención ya son los mismos que usa WEST IA de escritorio (`src/data/catalog.js`).

Mientras tanto, los cambios hechos en la demostración (gestión de OT, visitas, recuperabilidad) se guardan solo en el navegador.

## Tecnología

React 19 · Vite · Tailwind CSS v4 · three.js · React Router · TanStack Table v8 · Recharts · React-Leaflet · Framer Motion · lucide-react · tipografías Inter y Big Shoulders Display.

Mapas: Esri World Gray Canvas (oscuro y claro). CARTO Dark Matter, sugerido originalmente, hoy exige una clave de acceso; si se obtiene, se cambia en `src/components/charts/BranchMap.jsx`.
Foto de inicio: Unsplash (licencia libre).

## Cargar la flota real desde SAP

**Desde la página (recomendado):** Flota → **Cargar Excel del SAP** → elegir el Excel completo
(hoja de OT + maestro de vehículos). Se procesa en el mismo navegador en pocos segundos,
queda guardado ahí (IndexedDB) y la página se actualiza. El archivo no se envía a ningún servidor.
Para quitarlo: botón **Quitar datos cargados** en Flota.

**Por comando (opcional):**
```
python scripts/convertir_sap.py "C:utaSAP COMPLETO.xlsx"
```
genera `public/data/west-real.json`, que la web carga al abrir. Si existen ambos, se usa el más reciente.

> Los datos reales **no se suben a GitHub** (`public/data/` está en `.gitignore`).
> Los vehículos usados o en venta aparecen en Flota, pero no cuentan en los indicadores.

## Alertas y rankings

- **OT estancadas:** más de 15 / 30 días en taller, con responsable (el de la gestión o el sugerido de la sucursal).
- **Mantenciones:** vehículos a 1.000 km o menos de su próxima preventiva, y las vencidas.
- **Gasto por vehículo:** ranking del período con sugerencia *Evaluar venta* / *Revisar*. La preparación
  o equipamiento para clientes y faenas se muestra aparte y no cuenta para la sugerencia.
- **Sucursales:** disponibilidad, días en taller, OT > 15 días y gasto por vehículo, comparadas entre sí.

## Informe mensual

Reportes → **Informe mensual para gerencia** → elegir el mes → **Descargar Excel**
(resumen, sucursales, vehículos que más gastan, OT abiertas y mantenciones).
