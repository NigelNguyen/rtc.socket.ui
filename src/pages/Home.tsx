import { CreateRoom } from "../components/home/CreateRoom";
import { useAtomValue } from "jotai";
import { roomIdAtom } from "../store/room";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { JoinRoom } from "../components/home/JoinRoom";

export const HomePage = () => {
  const navigate = useNavigate();
  const roomId = useAtomValue(roomIdAtom);

  useEffect(() => {
    if (roomId) {
      navigate(`/room/${roomId}`);
    }
  }, [roomId, navigate]);

  return (
    <div className="flex gap-6">
      <CreateRoom />
      <JoinRoom />
    </div>
  );
};
