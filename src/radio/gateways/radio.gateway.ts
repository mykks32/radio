import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
} from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway({
  cors: { origin: '*' },
})
export class RadioGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  handleConnection(client: any) {
    console.log('Client connected:', client.id);
  }

  broadcastTrackStart(track: any) {
    this.server.emit('radio:track-started', {
      trackId: track.id,
      title: track.title,
    });
  }

  broadcastNextTrack(track: any) {
    this.server.emit('radio:track-ended', {
      track: track,
      next: true,
    });
  }
}
