> ## Documentation Index
> Fetch the complete documentation index at: https://docs.evolutionfoundation.com.br/llms.txt
> Use this file to discover all available pages before exploring further.

# Get all instances

> Get all instances



## OpenAPI

````yaml /api-reference/openapi/Evolution-Go/evo-go-instance.yaml get /instance/all
openapi: 3.0.0
info:
  title: Evolution Foundation - Evolution Go - Instance
  description: Go implementation of Evolution
  version: '1.0'
servers:
  - url: http://localhost:8080/
    description: Development server (HTTP)
  - url: https://localhost:8080/
    description: Development server (HTTPS)
  - url: '{customUrl}'
    description: Custom server
    variables:
      customUrl:
        default: https://your-instance.com
        description: Enter your server URL
security:
  - ApiKeyAuth: []
paths:
  /instance/all:
    get:
      summary: Get all instances
      description: Get all instances
      responses:
        '200':
          description: All instances retrieved successfully
          content:
            application/json:
              schema:
                type: object
                properties:
                  success:
                    type: boolean
                    example: true
                  instances:
                    type: array
                    items:
                      type: object
              example:
                data:
                  - id: a1b2c3d4-e5f6-7890-abcd-ef1234567890
                    name: test
                    token: f0e1d2c3-b4a5-6789-0abc-def123456789
                    webhook: ''
                    rabbitmqEnable: ''
                    websocketEnable: ''
                    natsEnable: ''
                    jid: ''
                    qrcode: ''
                    connected: false
                    expiration: 0
                    disconnect_reason: ''
                    events: ''
                    os_name: Evolution GO
                    proxy: ''
                    client_name: evolution
                    createdAt: '2026-01-15T10:30:00.000000-03:00'
                    alwaysOnline: false
                    rejectCall: false
                    msgRejectCall: ''
                    readMessages: false
                    ignoreGroups: false
                    ignoreStatus: false
                message: success
        '400':
          description: Bad Request - Invalid input data
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
              example:
                success: false
                error:
                  code: BAD_REQUEST
                  message: Invalid request data
                meta:
                  timestamp: '2024-01-15T10:30:00Z'
                  path: /instance/all
                  method: GET
        '401':
          description: Unauthorized - Invalid or missing API key
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
              example:
                success: false
                error:
                  code: UNAUTHORIZED
                  message: Invalid or missing API key
                meta:
                  timestamp: '2024-01-15T10:30:00Z'
                  path: /instance/all
                  method: GET
        '403':
          description: Forbidden - Insufficient permissions
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
              example:
                success: false
                error:
                  code: FORBIDDEN
                  message: Insufficient permissions to get all instances
                meta:
                  timestamp: '2024-01-15T10:30:00Z'
                  path: /instance/all
                  method: GET
        '404':
          description: Not Found - Resource not found
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
              example:
                success: false
                error:
                  code: NOT_FOUND
                  message: Resource not found
                meta:
                  timestamp: '2024-01-15T10:30:00Z'
                  path: /instance/all
                  method: GET
        '500':
          description: Internal Server Error
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
              example:
                success: false
                error:
                  code: INTERNAL_SERVER_ERROR
                  message: An unexpected error occurred
                meta:
                  timestamp: '2024-01-15T10:30:00Z'
                  path: /instance/all
                  method: GET
components:
  schemas:
    ErrorResponse:
      type: object
      required:
        - success
        - error
      properties:
        success:
          type: boolean
          example: false
        error:
          type: object
          required:
            - code
            - message
          properties:
            code:
              type: string
            message:
              type: string
        meta:
          type: object
          properties:
            timestamp:
              type: string
              format: date-time
            path:
              type: string
            method:
              type: string
  securitySchemes:
    ApiKeyAuth:
      type: apiKey
      in: header
      name: apikey
      description: API Key for authentication (global or instance-specific)

````