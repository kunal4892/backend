export type Msg = {
  id: number;
  role: "user" | "bot";
  text: string;
  ts: number;
};

export type Chat = {
  id: string;
  personaId: string;
  messages: Msg[];
};

export type Persona = {
  id: string;
  name: string;
  system_prompt?: string;
  style_prompt?: string;
  short_summary?: string;
  long_doc?: string;
  image_url?: string;
  is_premium?: boolean;
  defaultMessage?: string;
  caption?: string;
  metadata?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
};
