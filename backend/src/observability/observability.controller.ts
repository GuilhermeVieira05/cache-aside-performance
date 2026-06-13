import { Controller, Post, HttpCode, HttpStatus, HttpException } from '@nestjs/common';
import * as net from 'net';

const DOCKER_SOCKET = '/var/run/docker.sock';
const LOKI_CONTAINER = 'backend-loki-1';
const PROMTAIL_CONTAINER = 'backend-promtail-1';

function dockerRequest(
  method: string,
  path: string,
  body?: object,
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(DOCKER_SOCKET);
    let raw = '';

    const payload = body ? JSON.stringify(body) : '';
    const request = [
      `${method} ${path} HTTP/1.0`,
      'Host: localhost',
      'Content-Type: application/json',
      `Content-Length: ${Buffer.byteLength(payload)}`,
      '',
      payload,
    ].join('\r\n');

    socket.on('connect', () => {
      socket.write(request);
    });

    socket.on('data', (chunk) => {
      raw += chunk.toString();
    });

    socket.on('end', () => {
      const headerEnd = raw.indexOf('\r\n\r\n');
      const statusLine = raw.split('\r\n')[0];
      const statusCode = parseInt(statusLine.split(' ')[1] ?? '0', 10);
      const responseBody = headerEnd !== -1 ? raw.slice(headerEnd + 4) : '';
      resolve({ statusCode, body: responseBody });
    });

    socket.on('error', (err) => {
      reject(err);
    });
  });
}

@Controller('observability')
export class ObservabilityController {
  @Post('reset_loki')
  @HttpCode(HttpStatus.OK)
  async resetLoki() {
    try {
      // 1. Create exec in loki container
      const execRes = await dockerRequest(
        'POST',
        `/containers/${LOKI_CONTAINER}/exec`,
        {
          AttachStdout: false,
          AttachStderr: false,
          Cmd: [
            'sh',
            '-c',
            'rm -rf /loki/chunks/* /loki/index/* /loki/cache/* /loki/wal /loki/compactor/*',
          ],
        },
      );

      const execData = JSON.parse(execRes.body) as { Id: string };
      const execId = execData.Id;

      // 2. Start the exec (detached)
      await dockerRequest('POST', `/exec/${execId}/start`, { Detach: true });

      // 3. Restart loki container
      await dockerRequest('POST', `/containers/${LOKI_CONTAINER}/restart?t=3`);

      // 4. Restart promtail container
      await dockerRequest(
        'POST',
        `/containers/${PROMTAIL_CONTAINER}/restart?t=3`,
      );

      return { status: 'ok', message: 'Loki resetado com sucesso' };
    } catch (err) {
      throw new HttpException(
        { status: 'error', message: (err as Error).message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
