import { LoginOutlined } from "@ant-design/icons";
import { Button, Form, Input, InputRef, Modal } from "antd";
import { useSetAtom } from "jotai";
import { useRef, useState } from "react";
import toast from "react-hot-toast";
import { roomIdAtom } from "../../store/room";
import { useNavigate } from "react-router-dom";
import { request } from "../../utils/request";

export const JoinRoom = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const setRoomId = useSetAtom(roomIdAtom);
  const roomIdRef = useRef<InputRef>(null);
  const passwordRef = useRef<InputRef>(null);
  const naviagte = useNavigate();

  const showModal = () => {
    setIsModalOpen(true);
  };

  const handleJoinRoom = async () => {
    const data = await request("/join-room", "POST", {
      roomId: roomIdRef.current?.input?.value,
      password: passwordRef.current?.input?.value,
    });
    console.log({ data });
    const _roomId = data.roomId;

    if (_roomId) {
      setRoomId(_roomId);
      toast.success("Joined room successfully");
      naviagte(`/room/${_roomId}`);
    }
  };

  const handleCancel = () => {
    setIsModalOpen(false);
  };

  return (
    <>
      <Button onClick={showModal}>
        <LoginOutlined /> Join a room
      </Button>
      <Modal
        title="Join a room"
        open={isModalOpen}
        onOk={handleJoinRoom}
        onCancel={handleCancel}
        centered
      >
        <Form layout="vertical">
          <Form.Item label="RoomID">
            <Input type="text" ref={roomIdRef} />
          </Form.Item>
          <Form.Item label="Room Password">
            <Input type="password" ref={passwordRef} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};
