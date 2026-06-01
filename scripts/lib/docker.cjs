const { runCapture, sleep } = require("./process.cjs");

const SERVICE_TO_CONTAINER = {
  mysql: "american-surplus-mysql",
  redis: "american-surplus-redis",
  elasticsearch: "american-surplus-elasticsearch",
  logstash: "american-surplus-logstash",
  kibana: "american-surplus-kibana",
  cdn: "american-surplus-cdn",
};

async function inspectHealth(containerName) {
  const { stdout } = await runCapture("docker", [
    "inspect",
    "--format",
    "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}",
    containerName,
  ]);
  return stdout.trim();
}

async function waitForHealthy(serviceName, timeoutMs = 240000) {
  const containerName = SERVICE_TO_CONTAINER[serviceName] || serviceName;
  const start = Date.now();
  let lastStatus = "unknown";

  // Wait for container to be inspectable first.
  while (Date.now() - start < timeoutMs) {
    try {
      const status = await inspectHealth(containerName);
      lastStatus = status;
      console.log(`[local-init] waiting ${serviceName}: ${status}`);
      if (status === "healthy" || status === "running") {
        console.log(`[local-init] ${serviceName} is ready (${status})`);
        return;
      }
    } catch (error) {
      // container may not be up yet
      console.log(`[local-init] waiting ${serviceName}: container not ready yet`);
    }
    await sleep(3000);
  }

  throw new Error(
    `Timed out waiting for ${serviceName} (${containerName}) to become healthy (last status: ${lastStatus})`
  );
}

module.exports = {
  SERVICE_TO_CONTAINER,
  waitForHealthy,
};
