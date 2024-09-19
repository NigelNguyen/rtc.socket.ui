const SERVER_URL = import.meta.env.VITE_SERVER_URL;

export const request = async (endpoint:string, method = "GET", body = {}) => {
  const res = await fetch(`${SERVER_URL}${endpoint}`, {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    ...(method === "POST" && { body: JSON.stringify(body) }),
  });

  const data = await res.json()

  return data
};
