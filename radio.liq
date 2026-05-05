set("log.stdout", true)
set("server.telnet", true)
set("server.telnet.port", 1234)
set("server.telnet.bind_addr", "0.0.0.0")

p = playlist(mode="randomize", reload_mode="watch", "/music")
radio = mksafe(p)

server.register("track.remaining", fun(_) ->
  string_of(source.remaining(radio))
)

output.icecast(
  %mp3(bitrate=128),
  host="icecast",
  port=8000,
  password="hackme",
  mount="/live.mp3",
  radio
)