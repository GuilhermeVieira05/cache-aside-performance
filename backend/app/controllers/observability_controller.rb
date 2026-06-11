class ObservabilityController < ApplicationController
  LOKI_CONTAINER     = "backend-loki-1"
  PROMTAIL_CONTAINER = "backend-promtail-1"
  DOCKER_SOCKET      = "/var/run/docker.sock"

  def reset_loki
    exec_id = docker_exec(LOKI_CONTAINER, [
      "sh", "-c",
      "rm -rf /loki/chunks/* /loki/index/* /loki/cache/* /loki/wal /loki/compactor/*"
    ])
    docker_exec_start(exec_id)
    docker_restart(LOKI_CONTAINER)
    docker_restart(PROMTAIL_CONTAINER)

    render json: { status: "ok", message: "Loki resetado com sucesso" }
  rescue => e
    render json: { status: "error", message: e.message }, status: :internal_server_error
  end

  private

  def docker_request(method, path, body = nil)
    socket = UNIXSocket.new(DOCKER_SOCKET)

    body_json = body ? body.to_json : nil
    req  = "#{method} #{path} HTTP/1.0\r\nHost: localhost\r\n"
    req += "Content-Type: application/json\r\nContent-Length: #{body_json.bytesize}\r\n" if body_json
    req += "\r\n"
    req += body_json if body_json

    socket.write(req)
    raw = socket.read
    socket.close

    _headers, resp_body = raw.split("\r\n\r\n", 2)
    resp_body
  end

  def docker_exec(container, cmd)
    body = docker_request("POST", "/containers/#{container}/exec", {
      "AttachStdout" => false,
      "AttachStderr" => false,
      "Cmd"          => cmd
    })
    JSON.parse(body)["Id"]
  end

  def docker_exec_start(exec_id)
    docker_request("POST", "/exec/#{exec_id}/start", { "Detach" => true })
  end

  def docker_restart(container)
    docker_request("POST", "/containers/#{container}/restart?t=3")
  end
end
