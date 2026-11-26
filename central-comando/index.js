const http = require('node:http');

const PORT = Number(process.env.PORT || 4000);
const CONSUL_HOSTS = (process.env.CONSUL_HOSTS || 'consul-server-1,consul-server-2,consul-server-3')
  .split(',')
  .map((h) => h.trim());

const MISIONES_EJEMPLO = [
  'Patrullaje preventivo en zona costera',
  'Asistencia técnica a buque pesquero',
  'Control de boyas y balizamiento marítimo',
  'Operativo de búsqueda y rescate (SAR)',
  'Inspección de tráfico en canal de acceso'
];

let indiceTurno = 0;
let contadorMisiones = 0;

// 1. Consulta a Consul únicamente las unidades que tienen el Health Check en verde (passing=true)
async function obtenerUnidadesActivas() {
  for (const host of CONSUL_HOSTS) {
    try {
      const res = await fetch(`http://${host}:8500/v1/health/service/unidad-naval?passing=true`);
      if (res.ok) {
        return await res.json();
      }
    } catch (_) {
      // Si este nodo de Consul está caído, probamos con el siguiente del clúster
    }
  }
  throw new Error('No se pudo contactar a ningún servidor de Consul');
}

// 2. Elige una unidad por turnos (Round-Robin) y le envía la misión
async function despacharMision(descripcionManual) {
  contadorMisiones++;
  const nro = contadorMisiones;
  const descripcion =
    descripcionManual || MISIONES_EJEMPLO[(nro - 1) % MISIONES_EJEMPLO.length];

  try {
    const activas = await obtenerUnidadesActivas();

    if (activas.length === 0) {
      console.log(`[Misión #${nro}] ALERTA: No hay unidades navales disponibles en servicio.`);
      return { ok: false, error: 'Sin unidades operativas disponibles' };
    }

    // Balanceo de carga Round-Robin sobre las unidades saludables
    const elegida = activas[indiceTurno % activas.length];
    indiceTurno++;

    const { Address, Port, Meta, ID } = elegida.Service;
    const nombreUnidad = (Meta && Meta.nombre) || ID;

    const respuestaUnidad = await fetch(`http://${Address}:${Port}/mision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idMision: nro, descripcion })
    });

    const resultado = await respuestaUnidad.json();

    console.log(
      `[Misión #${nro}] "${descripcion}" -> Asignada a: ${nombreUnidad} (${resultado.zona}) | Alerta: ${resultado.estadoAlerta} | Unidades activas: ${activas.length}`
    );

    return { ok: true, mision: nro, descripcion, respuesta: resultado };
  } catch (err) {
    console.log(`[Misión #${nro}] Error al despachar: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

// 3. Servidor HTTP para disparar misiones manualmente desde el navegador
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/despachar' || url.pathname === '/') {
    const misionCustom = url.searchParams.get('mision');
    const resultado = await despacharMision(misionCustom);

    res.writeHead(resultado.ok ? 200 : 503, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(resultado, null, 2));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Usá /despachar para enviar una misión');
});

server.listen(PORT, () => {
  console.log(`[CENTRAL DE COMANDO] Operativa en puerto ${PORT}.`);
  console.log('[CENTRAL DE COMANDO] Despacho automático cada 6 segundos...');

  // Esperamos 3 segundos al arrancar para dar tiempo a que las unidades se registren
  setTimeout(() => {
    despacharMision();
    setInterval(() => despacharMision(), 6000);
  }, 3000);
});