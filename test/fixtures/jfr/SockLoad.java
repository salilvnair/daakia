import java.io.*;
import java.net.*;
import java.nio.file.*;

/** A server and a client on loopback, plus file writes, so a JFR recording
 *  carries jdk.SocketRead / jdk.SocketWrite / jdk.FileWrite with real payloads. */
public class SockLoad {
  public static void main(String[] a) throws Exception {
    ServerSocket ss = new ServerSocket(0);
    int port = ss.getLocalPort();

    Thread server = new Thread(() -> {
      try {
        while (true) {
          Socket s = ss.accept();
          InputStream in = s.getInputStream();
          OutputStream out = s.getOutputStream();
          byte[] buf = new byte[8192];
          int n;
          while ((n = in.read(buf)) > 0) {
            // A slow reply, so the event clears JFR's duration threshold.
            Thread.sleep(25);
            out.write(buf, 0, n);
            out.flush();
          }
          s.close();
        }
      } catch (Exception e) { }
    });
    server.setDaemon(true);
    server.start();

    Path f = Files.createTempFile("sockload", ".dat");
    byte[] payload = new byte[64 * 1024];

    for (int i = 0; i < 60; i++) {
      try (Socket c = new Socket("127.0.0.1", port)) {
        c.getOutputStream().write(payload);
        c.getOutputStream().flush();
        byte[] buf = new byte[8192];
        int total = 0, n;
        while (total < payload.length && (n = c.getInputStream().read(buf)) > 0) total += n;
      }
      Files.write(f, payload, StandardOpenOption.APPEND);
    }
    Files.deleteIfExists(f);
  }
}
