import { Button, Spin } from "antd";
import { useAtom, useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useNavigate, useParams } from "react-router-dom";
import { isHostAtom, roomIdAtom } from "../store/room";
import { request } from "../utils/request";
import openSocket from "socket.io-client";
import { LogoutOutlined } from "@ant-design/icons";
const SERVER_URL = import.meta.env.VITE_SERVER_URL;
const TURN_API_KEY = import.meta.env.VITE_TURN_API_KEY;
const TURN_APP_NAME = import.meta.env.VITE_TURN_APP_NAME;
const TURN_USER_NAME = import.meta.env.VITE_TURN_USER_NAME;
const socket = openSocket(`${SERVER_URL}`);

const config = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun.l.google.com:5349" },
    { urls: "stun:stun1.l.google.com:3478" },
    { urls: "stun:stun1.l.google.com:5349" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:5349" },
    { urls: "stun:stun3.l.google.com:3478" },
    { urls: "stun:stun3.l.google.com:5349" },
    { urls: "stun:stun4.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:5349" },
  ],
};

const userName = `USER-${Math.floor(Math.random() * 1000)}`;

let done = false;

export const RoomPage = () => {
  const { id: roomId } = useParams();
  const navigate = useNavigate();
  const pc = useMemo(
    () => new RTCPeerConnection({ ...config, iceTransportPolicy: "all" }),
    []
  );

  const [isHost, setIsHost] = useAtom(isHostAtom);
  const [isPreparingCall, setIsPreparingCall] = useState(false);
  const setRoomId = useSetAtom(roomIdAtom);
  const [isWaitingPeer, setIsWaitingPeer] = useState(() => isHost);
  const [offer, setOffer] = useState<RTCSessionDescriptionInit | null>(null);
  const [answer, setAnswer] = useState<RTCSessionDescriptionInit | null>(null);
  const [candidates, setCandidates] = useState<string[]>([]);

  const localVideo = useRef<HTMLVideoElement>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);

  const makeCall = useCallback(async () => {
    setIsPreparingCall(true);
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
    setOffer(offer);
    // 4. The caller calls RTCPeerConnection.setLocalDescription() to set that offer as the local description (that is, the description of the local end of the connection).
    await pc.setLocalDescription(offer);
    done = true;
  }, [pc]);

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
    setAnswer(answer);
    await pc.setLocalDescription(answer);
    await Promise.all(
      candidates.map(
        async (candidate: string) =>
          await pc.addIceCandidate(JSON.parse(candidate))
      )
    );
    done = true;
  }, [roomId, pc]);

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
    return () => {
      pc.close();
    };
  }, [pc]);

  useEffect(() => {
    socket.on("user-answer", async (data) => {
      const { answer, candidates } = data;
      console.log("Got answer from user", { answer, candidates });

      if (candidates.length === 0) {
        console.log("EMPTY CANDIDATES");
        setTimeout(() => {
          socket.emit("resend-user-candidates", { roomId });
          console.log("ASKING FOR USER CANDIDATES AGAIN...");
        }, 1000);
        return;
      }

      if (!pc.remoteDescription) {
        await pc.setRemoteDescription(answer);
      }

      await Promise.all(
        candidates.map(
          async (candidate: string) =>
            await pc
              .addIceCandidate(JSON.parse(candidate))
              .catch((e) => console.error("addIceCandidateError", e))
        )
      );
      setIsWaitingPeer(false);
      pc.getStats().then((stats) => {
        stats.forEach((report) => {
          if (
            report.type === "candidate-pair" &&
            report.state === "succeeded"
          ) {
            // This is the active candidate pair
            const localCandidateId = report.localCandidateId;
            const remoteCandidateId = report.remoteCandidateId;

            // Find details about the local candidate
            stats.forEach((candidate) => {
              if (candidate.id === localCandidateId) {
                console.log(`Local candidate type: ${candidate.candidateType}`);
              }
              if (candidate.id === remoteCandidateId) {
                console.log(
                  `Remote candidate type: ${candidate.candidateType}`
                );
              }
            });
          }
        });
      });
    });
  }, [roomId, pc]);

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
          setIsPreparingCall(false);
          return;
        }
        socket.emit("answer-call", { roomId, answer, candidates, userName });
        console.log("Sending answer to host");
      }
    };
    console.log({ candidates });
  }, [isHost, roomId, answer, offer, candidates, pc]);

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
  }, [remoteVideo, pc]);

  useEffect(() => {
    (async () => {
      const res = await fetch(
        `https://global.xirsys.net/_turn/${TURN_APP_NAME}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Basic " + btoa(`${TURN_USER_NAME}:${TURN_API_KEY}`),
          },
          body: JSON.stringify({ format: "urls" }),
        }
      );
      const data = await res.json();
      config.iceServers = data.v.iceServers;
      const configs = { ...pc.getConfiguration() };
      if (!data.v?.iceServers) return;
      configs.iceServers = [data.v.iceServers];
      pc.setConfiguration(configs);
    })();

    console.log({ getConfiguration: pc.getConfiguration() });
  }, []);

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
      <div className="flex flex-col justify-start gap-2">
        <div title={`socketID: ${socket.id}`}>USER: {userName}</div>
        <p className="text-sm">Copy the RoomID to share with your partner</p>
        <div>
          RoomID:{" "}
          <Button onClick={onCopyRoomId} loading={isPreparingCall}>
            {isPreparingCall ? "..." : roomId}
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap justify-center gap-6 mt-8">
        <video
          ref={localVideo}
          className="w-full border rounded-lg max-w-[calc(50%-12px)] min-h-60 min-w-80"
          autoPlay
          playsInline
          src=" "
        ></video>
        <video
          ref={remoteVideo}
          className="w-full border rounded-lg max-w-[calc(50%-12px)] min-h-60 min-w-80"
          autoPlay
          playsInline
          src=" "
        ></video>
      </div>
      {isWaitingPeer && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <Spin />
          <p>Waiting for peer to join...</p>
        </div>
      )}

      <Button onClick={onLeaveRoom} className="mt-4 text-white bg-red-500">
        <LogoutOutlined /> Leave Room
      </Button>
    </div>
  );
};
