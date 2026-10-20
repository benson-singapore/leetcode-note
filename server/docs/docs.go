package docs

import (
	_ "embed"
)

//go:embed swagger.json
var swaggerJSON []byte

func SwaggerJSON() []byte {
	return swaggerJSON
}
