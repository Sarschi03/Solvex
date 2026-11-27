import { app, pool } from "./app.js";
import { refreshInspectionRecommendations } from "./customerHistory.js";

const refreshRecommendations = () => { void refreshInspectionRecommendations(pool).catch(() => console.error('Inspection recommendation refresh failed.')); };
refreshRecommendations();
const recommendationTimer = setInterval(refreshRecommendations, 60 * 60 * 1000);
recommendationTimer.unref();

const port = Number(process.env.PORT ?? 3000);
const server = app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
});

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    clearInterval(recommendationTimer);
    server.close(() => {
      void pool.end().then(() => process.exit(0));
    });
  });
}
