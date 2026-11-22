package session

import "encoding/json"

// MessageType identifies the direction and payload of a WebSocket terminal frame.
type MessageType string

const (
	TypeInput  MessageType = "input"
	TypeResize MessageType = "resize"
	TypeOutput MessageType = "output"
	TypeStatus MessageType = "status"
	TypeError  MessageType = "error"
)

// Envelope is the wire format shared between the Go daemon and TypeScript client.
type Envelope struct {
	Type    MessageType `json:"type"`
	Data    string      `json:"data,omitempty"`
	Cols    uint16      `json:"cols,omitempty"`
	Rows    uint16      `json:"rows,omitempty"`
	Message string      `json:"message,omitempty"`
}

func MarshalEnvelope(env Envelope) ([]byte, error) {
	return json.Marshal(env)
}
