import "./App.css";
import { Route, Routes } from "react-router-dom";
import { HomePage } from "./pages/Home";
import { RoomPage } from "./pages/Room";
import { Toaster } from "react-hot-toast";
import { Provider, createStore } from "jotai";

function App() {
  const store = createStore();
  return (
    <>
      <Provider store={store}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/room/:id" element={<RoomPage />} />
        </Routes>
        <Toaster position="top-right" />
      </Provider>
    </>
  );
}

export default App;
