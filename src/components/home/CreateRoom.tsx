import { PlusCircleOutlined } from "@ant-design/icons";
import { Button, Form, Input, InputRef, Modal } from "antd";
import { useAtom, useSetAtom } from "jotai";
import { useRef, useState } from "react";
import toast from "react-hot-toast";
import { isHostAtom, roomIdAtom } from "../../store/room";
import { useNavigate } from "react-router-dom";
import { request } from "../../utils/request";

export const CreateRoom = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const passwordRef = useRef<InputRef>(null);
  const naviagte = useNavigate();

  const [roomId, setRoomId] = useAtom(roomIdAtom);
  const setIsHostAtom = useSetAtom(isHostAtom);

  const showModal = () => {
    setIsModalOpen(true);
  };

  const handleCreateRoom = async () => {
    const data = await request("/create-room", "POST", {
      password: passwordRef.current?.input?.value,
    });
    console.log({ data });
    const roomId = data.roomId;

    if (roomId) {
      setRoomId(roomId);
      setIsHostAtom(true);
      toast.success("Room created successfully");
      naviagte(`/room/${roomId}`);
    }
  };

  const handleCancel = () => {
    setIsModalOpen(false);
  };

  return (
    <>
      <Button onClick={showModal}>
        <PlusCircleOutlined /> Create a room
      </Button>
      <Modal
        title="Create a room"
        open={isModalOpen}
        onOk={handleCreateRoom}
        onCancel={handleCancel}
        centered
      >
        {!roomId && (
          <Form layout="vertical">
            <Form.Item label="Room Password">
              <Input type="password" ref={passwordRef} />
            </Form.Item>
          </Form>
        )}

        {roomId && <Input value={roomId} readOnly></Input>}
      </Modal>
    </>
  );
};
