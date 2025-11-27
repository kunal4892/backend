import React, { createContext, useContext, useState } from "react";

const PersonaContext = createContext<{
  personas: any[];
  setPersonas: React.Dispatch<React.SetStateAction<any[]>>;
}>({
  personas: [],
  setPersonas: () => {},
});

export const PersonaProvider = ({ children }: { children: React.ReactNode }) => {
  const [personas, setPersonas] = useState<any[]>([]);
  return (
    <PersonaContext.Provider value={{ personas, setPersonas }}>
      {children}
    </PersonaContext.Provider>
  );
};

export const usePersonas = () => useContext(PersonaContext);
