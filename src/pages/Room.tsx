import { Button } from "antd";
import { useAtom, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useNavigate, useParams } from "react-router-dom";
import { isHostAtom, roomIdAtom } from "../store/room";
import { request } from "../utils/request";
import openSocket from "socket.io-client";
const SERVER_URL = import.meta.env.VITE_SERVER_URL;
const socket = openSocket(`${SERVER_URL}`);

const peerConfiguration = { iceServers: [] };

(async () => {
  const response = await fetch(
    `https://owwi.metered.live/api/v1/turn/credentials?apiKey=${
      import.meta.env.VITE_TURN_API_KEY
    }`
  );
  const iceServers = await response.json();
  peerConfiguration.iceServers = iceServers;
})();
console.log({ peerConfiguration });
const pc = new RTCPeerConnection(peerConfiguration);

const userName = `USER-${Math.floor(Math.random() * 1000)}`;

let done = false;

export const RoomPage = () => {
  const { id: roomId } = useParams();
  const navigate = useNavigate();

  const [isHost, setIsHost] = useAtom(isHostAtom);
  const setRoomId = useSetAtom(roomIdAtom);
  const [isWaitingPeer, setIsWaitingPeer] = useState(() => isHost);

  const localVideo = useRef<HTMLVideoElement>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);

  const makeCall = useCallback(async () => {
    if (!localVideo.current) return;
    // 1.The caller captures local Media via MediaDevices.getUserMedia
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });

    localVideo.current.srcObject = stream;
    // 2.The caller creates RTCPeerConnection and calls RTCPeerConnection.addTrack() (Since addStream is deprecating)
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    // 3. The caller calls RTCPeerConnection.createOffer() to create an offer.
    const offer = await pc.createOffer();
    // 4. The caller calls RTCPeerConnection.setLocalDescription() to set that offer as the local description (that is, the description of the local end of the connection).
    await pc.setLocalDescription(offer);
    socket.emit("offer", { roomId, offer, host: userName });
    console.log("sent-offer");
    done = true;
  }, [roomId]);

  const joinCall = useCallback(async () => {
    if (!localVideo.current) return;
    // 1.The callee captures local Media via MediaDevices.getUserMedia
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    localVideo.current.srcObject = stream;
    // 2.The callee creates RTCPeerConnection and calls RTCPeerConnection.addTrack() (Since addStream is deprecating)
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    const data = await request(`/room-info/${roomId}`);
    const { offer, candidates } = data;
    console.log("join-room", { offer, candidates });
    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await Promise.all(
      candidates.map(
        async (candidate: string) =>
          await pc.addIceCandidate(JSON.parse(candidate))
      )
    );
    socket.emit("answer", { answer, roomId });
    console.log("send-answer");
    done = true;
  }, [roomId]);

  useEffect(() => {
    if (!done) {
      if (isHost) {
        makeCall();
      } else {
        joinCall();
      }
    }

    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        const candidate = event.candidate;
        if (isHost) {
          console.log({ candidate, roomId });
          socket.emit("host-candidate", { candidate, roomId });
          console.log("send-host-candidate");
          return;
        } else {
          console.log("request-callee-send-candidate");
          socket.emit("user-candidate", { candidate, roomId });
        }
      }
    };
  }, [isHost, roomId]);

  useEffect(() => {
    socket.on("user-answer", async ({ answer, candidates }) => {
      console.log("Got answer from user", answer);
      await pc.setRemoteDescription(answer);
      if (candidates.length === 0) {
        console.log("empty-candidates");
        socket.emit("resend-candidates", roomId);
        return;
      }
      await Promise.all(
        candidates.map(
          async (candidate: string) =>
            await pc.addIceCandidate(JSON.parse(candidate))
        )
      );
      setIsWaitingPeer(false);
      console.log(pc);
    });

    socket.on("user-candidates", async (candidates) => {
      if (candidates.length === 0) {
        console.log("empty-candidates");
        socket.emit("resend-candidates", roomId);
        return;
      }
      await Promise.all(
        candidates.map(
          async (candidate: string) =>
            await pc.addIceCandidate(JSON.parse(candidate))
        )
      );
    });
  }, []);

  useEffect(() => {
    pc.ontrack = (event) => {
      if (!remoteVideo.current) return;
      remoteVideo.current.srcObject = event.streams[0];
    };

    pc.onsignalingstatechange = (event) => {
      console.log("signaling-state", event);
    };

    pc.onicegatheringstatechange = () => {
      if (!isHost && pc.iceGatheringState === "complete") {
        socket.emit("user-candidate-complete", roomId);
      }
    };
  }, [remoteVideo, isHost]);

  if (!roomId) {
    navigate("/404");
    return null;
  }

  const onCopyRoomId = async () => {
    await navigator.clipboard.writeText(roomId);
    toast.success("Room ID copied to clipboard");
  };

  return (
    <div>
      <Button
        onClick={() => {
          setRoomId("");
          setIsHost(false);
          navigate("/", {
            replace: true,
          });
        }}
      >
        Leave Room
      </Button>
      <div>
        RoomID: <Button onClick={onCopyRoomId}>{roomId}</Button>
      </div>
      <p className="text-sm">Copy the RoomID to share with your partner</p>
      <div className="flex gap-6">
        <video
          ref={localVideo}
          className="rounded-sm"
          autoPlay
          playsInline
          src=" "
        ></video>
        {isWaitingPeer && <p>Waiting for peer to join...</p>}
        <video
          ref={remoteVideo}
          className={`${!isWaitingPeer ? "rounded-sm" : "w-0 h-0"}`}
          autoPlay
          playsInline
          src=" "
        ></video>
      </div>
    </div>
  );
};
