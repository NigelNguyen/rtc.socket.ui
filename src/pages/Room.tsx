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

const config = {
  iceServers: [
    // {
    //   username:
    //     "fCoVZEIMGRwt7p-WOb8NOJOenNONch_p7j0P9zHkAIqRcSGE7PZtbo7CZ280mWqPAAAAAGbtLR5qYXZ0aGFuaG5naGlh",
    //   urls: [
    //     "stun:hk-turn1.xirsys.com",
    //     "turn:hk-turn1.xirsys.com:80?transport=udp",
    //     "turn:hk-turn1.xirsys.com:3478?transport=udp",
    //     "turn:hk-turn1.xirsys.com:80?transport=tcp",
    //     "turn:hk-turn1.xirsys.com:3478?transport=tcp",
    //     "turns:hk-turn1.xirsys.com:443?transport=tcp",
    //     "turns:hk-turn1.xirsys.com:5349?transport=tcp",
    //   ],
    //   credential: "4cd6d9dc-7727-11ef-b620-0242ac120004",
    // },
  ],
};

const pc = new RTCPeerConnection(config);

(async () => {
  const res = await fetch("https://global.xirsys.net/_turn/owwirtc", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization:
        "Basic " + btoa("javthanhnghia:4ea4b994-771f-11ef-932c-0242ac130002"),
    },
    body: JSON.stringify({ format: "urls" }),
  });
  const data = await res.json();
  config.iceServers = data.v.iceServers;
  const configs = { ...pc.getConfiguration() };
  configs.iceServers = [data.v.iceServers];
  pc.setConfiguration(configs);
})();

console.log({ getConfiguration: pc.getConfiguration() });

const userName = `USER-${Math.floor(Math.random() * 1000)}`;

let done = false;

export const RoomPage = () => {
  const { id: roomId } = useParams();
  const navigate = useNavigate();

  const [isHost, setIsHost] = useAtom(isHostAtom);
  const setRoomId = useSetAtom(roomIdAtom);
  const [isWaitingPeer, setIsWaitingPeer] = useState(() => isHost);
  const [offer, setOffer] = useState<RTCSessionDescriptionInit | null>(null);
  const [answer, setAnswer] = useState<RTCSessionDescriptionInit | null>(null);
  const [candidates, setCandidates] = useState<string[]>([]);

  const localVideo = useRef<HTMLVideoElement>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);

  const makeCall = useCallback(async () => {
    if (!localVideo.current) return;
    // 1.The caller captures local Media via MediaDevices.getUserMedia
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      // audio: true,
    });

    localVideo.current.srcObject = stream;
    // 2.The caller creates RTCPeerConnection and calls RTCPeerConnection.addTrack() (Since addStream is deprecating)
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    // 3. The caller calls RTCPeerConnection.createOffer() to create an offer.
    const offer = await pc.createOffer();
    setOffer(offer);
    // 4. The caller calls RTCPeerConnection.setLocalDescription() to set that offer as the local description (that is, the description of the local end of the connection).
    await pc.setLocalDescription(offer);
    done = true;
  }, []);

  const joinCall = useCallback(async () => {
    if (!localVideo.current) return;
    // 1.The callee captures local Media via MediaDevices.getUserMedia
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      // audio: true,
    });
    localVideo.current.srcObject = stream;
    // 2.The callee creates RTCPeerConnection and calls RTCPeerConnection.addTrack() (Since addStream is deprecating)
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    const data = await request(`/room-info/${roomId}`);
    const { offer, candidates } = data;
    console.log("join-room", { offer, candidates });
    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    setAnswer(answer);
    await pc.setLocalDescription(answer);
    await Promise.all(
      candidates.map(
        async (candidate: string) =>
          await pc.addIceCandidate(JSON.parse(candidate))
      )
    );
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
  }, [isHost, makeCall, joinCall]);

  useEffect(() => {
    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        const candidate = event.candidate;
        setCandidates((prev) => [...prev, JSON.stringify(candidate)]);
      }
    };
  }, []);

  useEffect(() => {
    socket.on("user-answer", async ({ answer, candidates }) => {
      console.log("Got answer from user", { answer, candidates });
      await pc.setRemoteDescription(answer);
      await Promise.all(
        candidates.map(
          async (candidate: string) =>
            await pc
              .addIceCandidate(JSON.parse(candidate))
              .catch((e) => console.error("addIceCandidateError", e))
        )
      );
      setIsWaitingPeer(false);
      console.log(pc);
    });
  }, [roomId]);

  useEffect(() => {
    pc.onicegatheringstatechange = () => {
      if (
        pc.iceGatheringState === "complete" &&
        (answer || offer) &&
        candidates.length > 0
      ) {
        console.log("send candidates: ", candidates);
        if (isHost) {
          socket.emit("offer-call", { roomId, offer, candidates, userName });
          console.log("Sending offer to user");

          return;
        }
        socket.emit("answer-call", { roomId, answer, candidates, userName });
        console.log("Sending answer to host");
      }
    };
    console.log({ candidates });
  }, [isHost, roomId, answer, offer, candidates]);

  // Update remote video when a new track is added
  useEffect(() => {
    pc.ontrack = (event) => {
      console.log("ontrack", { stream: event.streams });
      if (!remoteVideo.current) return;
      remoteVideo.current.srcObject = event.streams[0];
    };

    pc.onsignalingstatechange = (event) => {
      console.log("signaling-state", event);
    };
  }, [remoteVideo]);

  if (!roomId) {
    navigate("/404");
    return null;
  }

  const onCopyRoomId = async () => {
    await navigator.clipboard.writeText(roomId);
    toast.success("Room ID copied to clipboard");
  };

  const onLeaveRoom = () => {
    setRoomId("");
    setIsHost(false);
    pc.close();
    socket.disconnect();
    navigate("/", {
      replace: true,
    });
    navigate(0);
  };

  return (
    <div>
      <div>USER: {userName}</div>
      <Button onClick={onLeaveRoom}>Leave Room</Button>
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
