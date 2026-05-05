import { Server, Socket } from 'socket.io';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { TrackMeta } from '../../playlist/playlist.types';
import { WS_EVENTS } from '../../common/constants/provider.constant';

@WebSocketGateway({
  cors: { origin: '*' },
})
export class RadioGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RadioGateway.name);

  handleConnection(socket: Socket) {
    this.logger.log(`Client connected: ${socket.id}`);
    this.server.emit(WS_EVENTS.CONNECTED, {
      message: `Client connect ${socket.id}`
    })
  }

  handleDisconnect(socket: Socket) {
    this.logger.log(`Client disconnected: ${socket.id}`);
  }

  emitTrackStart(track: TrackMeta) {
    this.server.emit(WS_EVENTS.TRACK_START, {
      trackId: track.id,
      title: track.title,
    });
  }

  emitTrackEnded(track: TrackMeta) {
    this.server.emit(WS_EVENTS.TRACK_ENDED, {
      track,
      next: true,
    });
  }
}
