import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ZodExceptionFilter } from "./zod-exception.filter";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalFilters(new ZodExceptionFilter());

  const corsOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(",").map((o) => o.trim())
    : true; // allow all origins when not configured (API uses Bearer tokens, not cookies)

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  const port = process.env.PORT ? Number(process.env.PORT) : 3001;
  await app.listen(port);
  console.log(`API listening on port ${port}`);
}

bootstrap();
