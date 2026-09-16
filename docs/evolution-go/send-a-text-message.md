> ## Documentation Index
> Fetch the complete documentation index at: https://docs.evolutionfoundation.com.br/llms.txt
> Use this file to discover all available pages before exploring further.

# Send a text message

> Send a text message



## OpenAPI

````yaml /api-reference/openapi/Evolution-Go/send-message.yaml post /send/text
openapi: 3.0.0
info:
  title: Evolution Foundation - Evolution Go - Send Message
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
security: []
paths:
  /send/text:
    post:
      summary: Send a text message
      description: Send a text message
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/SendText'
        description: Message data
      responses:
        '200':
          description: Text message sent successfully
          content:
            application/json:
              schema:
                type: object
                properties:
                  success:
                    type: boolean
                    example: true
                  message:
                    type: string
                  messageId:
                    type: string
              example:
                data:
                  Info:
                    Chat: 5511999999999@s.whatsapp.net
                    Sender: 5511888888888:24@s.whatsapp.net
                    IsFromMe: true
                    IsGroup: false
                    AddressingMode: ''
                    SenderAlt: ''
                    RecipientAlt: ''
                    BroadcastListOwner: ''
                    BroadcastRecipients: null
                    ID: 3EB0000000000000000010
                    ServerID: 0
                    Type: ExtendedTextMessage
                    PushName: ''
                    Timestamp: '2026-01-15T10:30:00.000000-03:00'
                    Category: ''
                    Multicast: false
                    MediaType: ''
                    Edit: ''
                    MsgBotInfo:
                      EditType: ''
                      EditTargetID: ''
                      EditSenderTimestampMS: '0001-01-01T00:00:00Z'
                    MsgMetaInfo:
                      TargetID: ''
                      TargetSender: ''
                      TargetChat: ''
                      DeprecatedLIDSession: null
                      ThreadMessageID: ''
                      ThreadMessageSenderJID: ''
                    VerifiedName: null
                    DeviceSentMeta: null
                  Message:
                    extendedTextMessage:
                      text: message text
                      contextInfo: {}
                  MessageContextInfo:
                    stanzaID: ''
                    participant: ''
                    quotedMessage:
                      conversation: ''
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
                  message: >-
                    Invalid request data. Text and recipient information are
                    required.
                meta:
                  timestamp: '2024-01-15T10:30:00Z'
                  path: /send/text
                  method: POST
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
                  path: /send/text
                  method: POST
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
                  message: Insufficient permissions to send text message
                meta:
                  timestamp: '2024-01-15T10:30:00Z'
                  path: /send/text
                  method: POST
        '404':
          description: Not Found - Recipient not found
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
              example:
                success: false
                error:
                  code: NOT_FOUND
                  message: Recipient not found
                meta:
                  timestamp: '2024-01-15T10:30:00Z'
                  path: /send/text
                  method: POST
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
                  path: /send/text
                  method: POST
components:
  schemas:
    SendText:
      type: object
      properties:
        delay:
          type: integer
        id:
          type: string
        mentionAll:
          type: boolean
        mentionedJid:
          type: string
        number:
          type: string
        quoted:
          $ref: '#/components/schemas/QuotedMessage'
        text:
          type: string
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
    QuotedMessage:
      type: object
      properties:
        messageId:
          type: string
        participant:
          type: string

````