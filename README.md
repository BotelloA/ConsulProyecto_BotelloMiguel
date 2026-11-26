# Central de Despacho de Flota Naval con HashiCorp Consul

Proyecto práctico integrador para la promoción de **Sistemas Distribuidos (2026)** — Universidad Nacional de la Patagonia San Juan Bosco (UNPSJB).

## Descripción del Proyecto

El sistema simula una **Central de Despacho de Flota de Emergencia y Patrullaje Naval** construida sobre una arquitectura de microservicios en **Node.js**, utilizando **HashiCorp Consul** como infraestructura de coordinación distribuida y **Docker Compose** para el despliegue del entorno multi-nodo.

El objetivo es demostrar de forma práctica los principios fundamentales de **Service Discovery**, **detección activa de fallas (Health Checking)**, **configuración dinámica distribuida (Key-Value Store)** y **consenso mediante el algoritmo Raft**.

## Arquitectura del Sistema

El entorno se despliega en una red virtual aislada (`red-naval`) compuesta por 7 contenedores:

* **Clúster de Control (`consul-server-1`, `consul-server-2`, `consul-server-3`):** Tres servidores Consul configurados en modo servidor con `-bootstrap-expect=3`. Mantienen el catálogo de servicios y el almacenamiento Key-Value replicados mediante consenso **Raft** (quórum de mayoría: 2 de 3 nodos) y gestionan la membresía mediante el protocolo **Gossip**.
* **Unidades Navales (`unidad-naval-1`, `unidad-naval-2`, `unidad-naval-3`):** Tres instancias independientes (*Guardacostas Almirante Brown*, *Patrullera Patagonia* y *Remolcador San Jorge*). Al iniciar, cada unidad se auto-registra en Consul, expone un endpoint `/health` monitoreado cada 5 segundos y consulta dinámicamente el boletín de alerta global antes de aceptar misiones.
* **Central de Comando (`central-comando`):** Cliente consumidor que aplica transparencia de ubicación. Antes de cada despacho, consulta a Consul únicamente las unidades saludables (`?passing=true`) y reparte las misiones utilizando balanceo de carga **Round-Robin**.

## Requisitos Previos

* [Docker](https://www.docker.com/) y **Docker Compose** instalados y en ejecución.

## Instrucciones de Ejecución

1. Clonar el repositorio y ubicarse en la carpeta raíz del proyecto:
   ```bash
   git clone <https://github.com/BotelloA/ConsulProyecto_BotelloMiguel.git>
   cd central-despacho-consul
   ```

2. Construir las imágenes y levantar todo el clúster en segundo plano:
   ```bash
   docker compose up -d --build
   ```

3. Verificar el estado del sistema:
   * **Interfaz Web (UI) de Consul:** Abrir `http://localhost:8500` en el navegador para visualizar nodos, servicios, *health checks* y el almacén Key-Value.
   * **Logs de despacho en tiempo real:**
     ```bash
     docker compose logs -f central-comando
     ```
   * **Disparo manual de una misión:** Abrir `http://localhost:4000/despachar` (o `http://localhost:4000/despachar?mision=Rescate+Urgente`).

## Escenarios de Prueba

### 1. Detección Activa de Fallas y Recuperación (Health Checking)
Simular la caída de una unidad naval:
```bash
docker stop unidad-naval-2
```
Consul detectará la falla en el endpoint `/health` (estado *Critical*) y la Central redirigirá las misiones exclusivamente entre las dos unidades restantes sin interrumpir el servicio. Para reincorporarla:
```bash
docker start unidad-naval-2
```

### 2. Configuración Dinámica en Caliente (Consul Key-Value)
1. Ingresar a `http://localhost:8500` -> **Key/Value** -> **Create**.
2. Crear la clave `flota/estado_alerta` con el valor `TEMPORAL_ROJO` y guardar.
3. Observar en los logs de `central-comando` cómo todas las unidades adoptan el nuevo estado de alerta en la siguiente misión sin reiniciar contenedores.

### 3. Tolerancia a Fallas y Quórum (Algoritmo Raft)
1. Detener un servidor del clúster (quedan 2/3 activos, se conserva mayoría):
   ```bash
   docker stop consul-server-3
   ```
   El sistema continúa operando y aceptando cambios en el Key-Value Store.
2. Detener un segundo servidor (queda 1/3 activo, se pierde quórum):
   ```bash
   docker stop consul-server-2
   ```
   El clúster queda sin líder (`No cluster leader`) y rechaza nuevas escrituras/lecturas consistentes para evitar inconsistencias (*split-brain*).
3. Restaurar los nodos detenidos:
   ```bash
   docker start consul-server-2 consul-server-3
   ```

## Detener y Limpiar el Entorno

Para apagar todos los contenedores y eliminar la red virtual creada:
```bash
docker compose down
```