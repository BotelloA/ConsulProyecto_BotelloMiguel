const http = require('node:http');

// Leemos la configuración que nos pasa Docker Compose por variables de entorno
const PORT = Number(process.env.PORT || 3000);
const UNIT_ID = process.env.UNIT_ID || 'unidad-1';
const UNIT_HOST = process.env.UNIT_HOST || 'unidad-naval-1';
const UNIT_NAME = process.env.UNIT_NAME || 'Unidad Genérica';
const UNIT_TYPE = process.env.UNIT_TYPE || 'Patrullera';
const ZONE = process.env.ZONE || 'Zona General';
const CONSUL_HOST = process.env.CONSUL_HOST || 'consul-server-1';

// 1. Función para registrar este barco en el catálogo de Consul
async function registrarEnConsul() {
  const payload = {
    ID: UNIT_ID,
    Name: 'unidad-naval', // Todas las unidades comparten este nombre de servicio
    Tags: [UNIT_TYPE.toLowerCase(), ZONE.toLowerCase()],
    Address: UNIT_HOST,
    Port: PORT,
    Meta: {
      nombre: UNIT_NAME,
      tipo: UNIT_TYPE,
      zona: ZONE
    },
    Check: {
      HTTP: `http://${UNIT_HOST}:${PORT}/health`,
      Interval: '5s',
      Timeout: '2s'
    }
  };

  while (true) {
    try {
      const res = await fetch(`http://${CONSUL_HOST}:8500/v1/agent/service/register`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        console.log(`[${UNIT_NAME}] Registrada con éxito en Consul (ID: ${UNIT_ID}).`);
        break;
      }
      console.log(`[${UNIT_NAME}] Consul respondió ${res.status}, reintentando en 3s...`);
    } catch (err) {
      console.log(`[${UNIT_NAME}] Esperando a que Consul esté listo...`);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
}

// 2. Consulta dinámica al Key-Value Store de Consul (boletín meteorológico/alerta)
async function obtenerEstadoAlerta() {
  try {
    const res = await fetch(`http://${CONSUL_HOST}:8500/v1/kv/flota/estado_alerta?raw`);
    if (res.ok) {
      return await res.text();
    }
  } catch (_) {}
  return 'NORMAL';
}

// 3. Servidor HTTP de la unidad naval
const server = http.createServer(async (req, res) => {
  // Ruta de chequeo de salud para Consul
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
    return;
  }

  // Ruta para recibir misiones desde la Central de Comando
  if (req.method === 'POST' && req.url === '/mision') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      const datos = body ? JSON.parse(body) : {};
      const alertaActual = await obtenerEstadoAlerta();

      console.log(`[${UNIT_NAME}] Misión recibida: "${datos.descripcion || 'Patrullaje'}" | Alerta global: ${alertaActual}`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        unidad: UNIT_NAME,
        id: UNIT_ID,
        tipo: UNIT_TYPE,
        zona: ZONE,
        estadoAlerta: alertaActual,
        mensaje: `Misión aceptada por ${UNIT_NAME}`
      }));
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Ruta no encontrada');
});

server.listen(PORT, () => {
  console.log(`[${UNIT_NAME}] Operativa en puerto ${PORT} (${ZONE}).`);
  registrarEnConsul();
});