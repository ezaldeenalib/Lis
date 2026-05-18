import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AppModule } from './app.module';
import { resolveCorsOrigins } from './cors-origins';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useWebSocketAdapter(new IoAdapter(app));

  const corsOrigins = resolveCorsOrigins();
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('LIS SaaS API')
    .setDescription('Laboratory Information System API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = Number(process.env.API_PORT) || 4000;
  const host = process.env.API_HOST || '0.0.0.0';
  await app.listen(port, host);

  const publicHost = process.env.PUBLIC_HOST?.trim();
  const displayHost = publicHost || (host === '0.0.0.0' ? 'localhost' : host);
  console.log(`🔬 LIS API listening on ${host}:${port}`);
  console.log(`   → http://${displayHost}:${port}`);
  console.log(`📚 Swagger: http://${displayHost}:${port}/docs`);
  console.log(`   CORS: ${Array.isArray(corsOrigins) ? corsOrigins.join(', ') : corsOrigins}`);
}
bootstrap();
