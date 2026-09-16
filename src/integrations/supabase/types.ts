export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_conversations: {
        Row: {
          created_at: string
          id: string
          provider: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          provider?: string | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          provider?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          model: string | null
          provider: string | null
          role: string
          status: string
          user_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          model?: string | null
          provider?: string | null
          role: string
          status?: string
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          model?: string | null
          provider?: string | null
          role?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      app_config: {
        Row: {
          chave: string
          updated_at: string
          valor: string | null
        }
        Insert: {
          chave: string
          updated_at?: string
          valor?: string | null
        }
        Update: {
          chave?: string
          updated_at?: string
          valor?: string | null
        }
        Relationships: []
      }
      areas_gerentes_postos: {
        Row: {
          created_at: string
          gerente_nome: string
          id: string
          posto_localidade: string | null
          posto_nome: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          gerente_nome: string
          id?: string
          posto_localidade?: string | null
          posto_nome: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          gerente_nome?: string
          id?: string
          posto_localidade?: string | null
          posto_nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      arquivos: {
        Row: {
          caminho: string
          created_at: string
          gerente_id: string | null
          id: string
          nome: string
          tamanho: number
          updated_at: string
        }
        Insert: {
          caminho: string
          created_at?: string
          gerente_id?: string | null
          id?: string
          nome: string
          tamanho?: number
          updated_at?: string
        }
        Update: {
          caminho?: string
          created_at?: string
          gerente_id?: string | null
          id?: string
          nome?: string
          tamanho?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "arquivos_gerente_id_fkey"
            columns: ["gerente_id"]
            isOneToOne: false
            referencedRelation: "gerentes"
            referencedColumns: ["id"]
          },
        ]
      }
      arquivos_importados: {
        Row: {
          created_at: string
          dashboard: string
          formato: string
          hash_arquivo: string
          id: string
          importado_em: string
          mensagem_erro: string | null
          nome_original: string
          registros: number
          status_processamento: string
          status_sincronizacao: string
          storage_bucket: string
          storage_path: string
          tamanho: number
          ultima_sincronizacao: string | null
          updated_at: string
          usuario_id: string | null
          usuario_nome: string
        }
        Insert: {
          created_at?: string
          dashboard: string
          formato?: string
          hash_arquivo: string
          id?: string
          importado_em?: string
          mensagem_erro?: string | null
          nome_original: string
          registros?: number
          status_processamento?: string
          status_sincronizacao?: string
          storage_bucket?: string
          storage_path: string
          tamanho?: number
          ultima_sincronizacao?: string | null
          updated_at?: string
          usuario_id?: string | null
          usuario_nome?: string
        }
        Update: {
          created_at?: string
          dashboard?: string
          formato?: string
          hash_arquivo?: string
          id?: string
          importado_em?: string
          mensagem_erro?: string | null
          nome_original?: string
          registros?: number
          status_processamento?: string
          status_sincronizacao?: string
          storage_bucket?: string
          storage_path?: string
          tamanho?: number
          ultima_sincronizacao?: string | null
          updated_at?: string
          usuario_id?: string | null
          usuario_nome?: string
        }
        Relationships: []
      }
      arquivos_sincronizacoes: {
        Row: {
          arquivo_id: string | null
          created_at: string
          dashboard: string
          id: string
          mensagem: string
          registros: number
          resultado: string
          usuario_id: string | null
          usuario_nome: string
        }
        Insert: {
          arquivo_id?: string | null
          created_at?: string
          dashboard: string
          id?: string
          mensagem?: string
          registros?: number
          resultado: string
          usuario_id?: string | null
          usuario_nome?: string
        }
        Update: {
          arquivo_id?: string | null
          created_at?: string
          dashboard?: string
          id?: string
          mensagem?: string
          registros?: number
          resultado?: string
          usuario_id?: string | null
          usuario_nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "arquivos_sincronizacoes_arquivo_id_fkey"
            columns: ["arquivo_id"]
            isOneToOne: false
            referencedRelation: "arquivos_importados"
            referencedColumns: ["id"]
          },
        ]
      }
      assinatura_auditoria: {
        Row: {
          created_at: string
          detalhe: string | null
          dispositivo: string | null
          documento_id: string
          evento: string
          id: string
          ip: string | null
          signatario_id: string | null
        }
        Insert: {
          created_at?: string
          detalhe?: string | null
          dispositivo?: string | null
          documento_id: string
          evento: string
          id?: string
          ip?: string | null
          signatario_id?: string | null
        }
        Update: {
          created_at?: string
          detalhe?: string | null
          dispositivo?: string | null
          documento_id?: string
          evento?: string
          id?: string
          ip?: string | null
          signatario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assinatura_auditoria_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "assinatura_documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assinatura_auditoria_signatario_id_fkey"
            columns: ["signatario_id"]
            isOneToOne: false
            referencedRelation: "assinatura_signatarios"
            referencedColumns: ["id"]
          },
        ]
      }
      assinatura_documentos: {
        Row: {
          assinado_path: string | null
          campos: Json
          cancelado_em: string | null
          concluido_em: string | null
          created_at: string
          criado_por_nome: string | null
          exige_codigo: boolean
          expira_em: string | null
          hash_sha256: string | null
          id: string
          original_path: string | null
          preenchido_path: string | null
          protocolo: string
          status: string
          tipo: string
          titulo: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assinado_path?: string | null
          campos?: Json
          cancelado_em?: string | null
          concluido_em?: string | null
          created_at?: string
          criado_por_nome?: string | null
          exige_codigo?: boolean
          expira_em?: string | null
          hash_sha256?: string | null
          id?: string
          original_path?: string | null
          preenchido_path?: string | null
          protocolo: string
          status?: string
          tipo?: string
          titulo: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assinado_path?: string | null
          campos?: Json
          cancelado_em?: string | null
          concluido_em?: string | null
          created_at?: string
          criado_por_nome?: string | null
          exige_codigo?: boolean
          expira_em?: string | null
          hash_sha256?: string | null
          id?: string
          original_path?: string | null
          preenchido_path?: string | null
          protocolo?: string
          status?: string
          tipo?: string
          titulo?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      assinatura_modelos: {
        Row: {
          campos: Json
          created_at: string
          id: string
          nome: string
          original_path: string | null
          tipo: string
          updated_at: string
          user_id: string
        }
        Insert: {
          campos?: Json
          created_at?: string
          id?: string
          nome: string
          original_path?: string | null
          tipo?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          campos?: Json
          created_at?: string
          id?: string
          nome?: string
          original_path?: string | null
          tipo?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      assinatura_signatarios: {
        Row: {
          assinado_em: string | null
          assinatura_path: string | null
          codigo_expira_em: string | null
          codigo_hash: string | null
          created_at: string
          dispositivo: string | null
          documento_id: string
          email: string | null
          id: string
          ip: string | null
          motivo_recusa: string | null
          nome: string
          ordem: number
          recusado_em: string | null
          status: string
          telefone: string | null
          token_hash: string
          updated_at: string
          visualizado_em: string | null
        }
        Insert: {
          assinado_em?: string | null
          assinatura_path?: string | null
          codigo_expira_em?: string | null
          codigo_hash?: string | null
          created_at?: string
          dispositivo?: string | null
          documento_id: string
          email?: string | null
          id?: string
          ip?: string | null
          motivo_recusa?: string | null
          nome: string
          ordem?: number
          recusado_em?: string | null
          status?: string
          telefone?: string | null
          token_hash: string
          updated_at?: string
          visualizado_em?: string | null
        }
        Update: {
          assinado_em?: string | null
          assinatura_path?: string | null
          codigo_expira_em?: string | null
          codigo_hash?: string | null
          created_at?: string
          dispositivo?: string | null
          documento_id?: string
          email?: string | null
          id?: string
          ip?: string | null
          motivo_recusa?: string | null
          nome?: string
          ordem?: number
          recusado_em?: string | null
          status?: string
          telefone?: string | null
          token_hash?: string
          updated_at?: string
          visualizado_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assinatura_signatarios_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "assinatura_documentos"
            referencedColumns: ["id"]
          },
        ]
      }
      atestados_verificados: {
        Row: {
          caminho_storage: string
          classificacao: string
          created_at: string
          faixa_risco: string
          hash_sha256: string
          id: string
          nome_arquivo: string
          observacao: string
          pontuacao_risco: number
          tamanho_arquivo: number
          texto_extraido: string
          tipo_arquivo: string
          updated_at: string
          user_id: string
        }
        Insert: {
          caminho_storage: string
          classificacao: string
          created_at?: string
          faixa_risco?: string
          hash_sha256: string
          id?: string
          nome_arquivo: string
          observacao?: string
          pontuacao_risco?: number
          tamanho_arquivo?: number
          texto_extraido?: string
          tipo_arquivo: string
          updated_at?: string
          user_id: string
        }
        Update: {
          caminho_storage?: string
          classificacao?: string
          created_at?: string
          faixa_risco?: string
          hash_sha256?: string
          id?: string
          nome_arquivo?: string
          observacao?: string
          pontuacao_risco?: number
          tamanho_arquivo?: number
          texto_extraido?: string
          tipo_arquivo?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      avaliacoes_gerentes_area: {
        Row: {
          avaliador_id: string
          avaliador_nome: string | null
          created_at: string
          duracao_segundos: number | null
          gerente_nome: string
          id: string
          mes_referencia: string
          nota_cliente: number
          nota_comunicacao: number
          nota_lideranca: number
          nota_operacao: number
          nota_prazos: number
          observacoes: string | null
          pontos_fortes: string | null
          pontos_melhoria: string | null
          updated_at: string
        }
        Insert: {
          avaliador_id?: string
          avaliador_nome?: string | null
          created_at?: string
          duracao_segundos?: number | null
          gerente_nome: string
          id?: string
          mes_referencia: string
          nota_cliente?: number
          nota_comunicacao?: number
          nota_lideranca?: number
          nota_operacao?: number
          nota_prazos?: number
          observacoes?: string | null
          pontos_fortes?: string | null
          pontos_melhoria?: string | null
          updated_at?: string
        }
        Update: {
          avaliador_id?: string
          avaliador_nome?: string | null
          created_at?: string
          duracao_segundos?: number | null
          gerente_nome?: string
          id?: string
          mes_referencia?: string
          nota_cliente?: number
          nota_comunicacao?: number
          nota_lideranca?: number
          nota_operacao?: number
          nota_prazos?: number
          observacoes?: string | null
          pontos_fortes?: string | null
          pontos_melhoria?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      canais_drm: {
        Row: {
          ativo: boolean
          created_at: string
          criado_por: string | null
          erro_verificacao: string | null
          id: string
          latencia_ms: number | null
          nome: string
          status: string
          ultima_verificacao: string | null
          updated_at: string
          url: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          criado_por?: string | null
          erro_verificacao?: string | null
          id?: string
          latencia_ms?: number | null
          nome: string
          status?: string
          ultima_verificacao?: string | null
          updated_at?: string
          url: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          criado_por?: string | null
          erro_verificacao?: string | null
          id?: string
          latencia_ms?: number | null
          nome?: string
          status?: string
          ultima_verificacao?: string | null
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      chat_direct_conversations: {
        Row: {
          assigned_at: string | null
          assigned_to: string | null
          contato_cargo: string | null
          contato_matricula: string | null
          contato_nome: string
          contato_posto: string | null
          created_at: string
          id: string
          last_message_at: string | null
          nexti_person_id: number
          status: string
          ultima_leitura_nexti: string | null
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_to?: string | null
          contato_cargo?: string | null
          contato_matricula?: string | null
          contato_nome: string
          contato_posto?: string | null
          created_at?: string
          id?: string
          last_message_at?: string | null
          nexti_person_id: number
          status?: string
          ultima_leitura_nexti?: string | null
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          assigned_to?: string | null
          contato_cargo?: string | null
          contato_matricula?: string | null
          contato_nome?: string
          contato_posto?: string | null
          created_at?: string
          id?: string
          last_message_at?: string | null
          nexti_person_id?: number
          status?: string
          ultima_leitura_nexti?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      chat_direct_messages: {
        Row: {
          autor: string
          content: string
          conversation_id: string
          created_at: string
          entregue: boolean
          erro_envio: string | null
          id: string
          nexti_message_id: string | null
          user_id: string | null
        }
        Insert: {
          autor?: string
          content: string
          conversation_id: string
          created_at?: string
          entregue?: boolean
          erro_envio?: string | null
          id?: string
          nexti_message_id?: string | null
          user_id?: string | null
        }
        Update: {
          autor?: string
          content?: string
          conversation_id?: string
          created_at?: string
          entregue?: boolean
          erro_envio?: string | null
          id?: string
          nexti_message_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_direct_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_direct_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_direct_transfers: {
        Row: {
          conversation_id: string
          created_at: string
          de_user_id: string | null
          id: string
          motivo: string | null
          para_user_id: string | null
        }
        Insert: {
          conversation_id: string
          created_at?: string
          de_user_id?: string | null
          id?: string
          motivo?: string | null
          para_user_id?: string | null
        }
        Update: {
          conversation_id?: string
          created_at?: string
          de_user_id?: string | null
          id?: string
          motivo?: string | null
          para_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_direct_transfers_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_direct_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_message_reads: {
        Row: {
          id: string
          last_read_at: string
          room_id: string
          user_id: string
        }
        Insert: {
          id?: string
          last_read_at?: string
          room_id: string
          user_id: string
        }
        Update: {
          id?: string
          last_read_at?: string
          room_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_message_reads_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "chat_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          attachment_name: string | null
          attachment_type: string | null
          attachment_url: string | null
          content: string
          created_at: string
          deleted: boolean
          edited: boolean
          id: string
          room_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attachment_name?: string | null
          attachment_type?: string | null
          attachment_url?: string | null
          content?: string
          created_at?: string
          deleted?: boolean
          edited?: boolean
          id?: string
          room_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attachment_name?: string | null
          attachment_type?: string | null
          attachment_url?: string | null
          content?: string
          created_at?: string
          deleted?: boolean
          edited?: boolean
          id?: string
          room_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "chat_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_queue_agents: {
        Row: {
          added_at: string
          id: string
          queue_id: string
          user_id: string
        }
        Insert: {
          added_at?: string
          id?: string
          queue_id: string
          user_id: string
        }
        Update: {
          added_at?: string
          id?: string
          queue_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_queue_agents_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "chat_queues"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_queue_conversations: {
        Row: {
          assigned_at: string | null
          assigned_to: string | null
          created_at: string
          finished_at: string | null
          id: string
          queue_id: string
          room_id: string
          started_by: string | null
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_to?: string | null
          created_at?: string
          finished_at?: string | null
          id?: string
          queue_id: string
          room_id: string
          started_by?: string | null
          status?: string
          subject?: string
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          assigned_to?: string | null
          created_at?: string
          finished_at?: string | null
          id?: string
          queue_id?: string
          room_id?: string
          started_by?: string | null
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_queue_conversations_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "chat_queues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_queue_conversations_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "chat_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_queues: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          department: string
          description: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          department?: string
          description?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          department?: string
          description?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      chat_room_members: {
        Row: {
          id: string
          joined_at: string
          role: string
          room_id: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          role?: string
          room_id: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          role?: string
          room_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_room_members_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "chat_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_rooms: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      chegadas_posto: {
        Row: {
          avisado_whatsapp: boolean
          created_at: string
          distancia_metros: number | null
          erro_aviso: string | null
          id: string
          latitude: number | null
          longitude: number | null
          posto_nexti_id: number | null
          posto_nome: string
          user_id: string
        }
        Insert: {
          avisado_whatsapp?: boolean
          created_at?: string
          distancia_metros?: number | null
          erro_aviso?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          posto_nexti_id?: number | null
          posto_nome: string
          user_id?: string
        }
        Update: {
          avisado_whatsapp?: boolean
          created_at?: string
          distancia_metros?: number | null
          erro_aviso?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          posto_nexti_id?: number | null
          posto_nome?: string
          user_id?: string
        }
        Relationships: []
      }
      colaboradores_ponto: {
        Row: {
          cargo: string
          created_at: string
          empresa: string
          id: string
          matricula: string
          nome: string
          posto: string
          revisar: boolean
          updated_at: string
        }
        Insert: {
          cargo: string
          created_at?: string
          empresa: string
          id?: string
          matricula: string
          nome: string
          posto: string
          revisar?: boolean
          updated_at?: string
        }
        Update: {
          cargo?: string
          created_at?: string
          empresa?: string
          id?: string
          matricula?: string
          nome?: string
          posto?: string
          revisar?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      crt_lancamentos: {
        Row: {
          assinatura_colaborador: string | null
          assinatura_em: string | null
          assinatura_ip: string | null
          assinatura_nome: string | null
          assinatura_token: string | null
          assinatura_token_expira_em: string | null
          colaborador: string
          created_at: string
          criado_por: string | null
          enviado_por_nome: string | null
          fim: string | null
          id: string
          inicio: string | null
          lancado_em: string | null
          lancado_por: string | null
          lancado_por_nome: string | null
          motivo: string
          person_id: string | null
          posto_id: string | null
          posto_nome: string
          recebeu_refeicao: string
          recebeu_vt: string
          recebido_em: string | null
          status: string
          substituto: string
          substituto_person_id: string | null
          supervisor: string
          updated_at: string
          valor_receber: string
        }
        Insert: {
          assinatura_colaborador?: string | null
          assinatura_em?: string | null
          assinatura_ip?: string | null
          assinatura_nome?: string | null
          assinatura_token?: string | null
          assinatura_token_expira_em?: string | null
          colaborador: string
          created_at?: string
          criado_por?: string | null
          enviado_por_nome?: string | null
          fim?: string | null
          id?: string
          inicio?: string | null
          lancado_em?: string | null
          lancado_por?: string | null
          lancado_por_nome?: string | null
          motivo?: string
          person_id?: string | null
          posto_id?: string | null
          posto_nome?: string
          recebeu_refeicao?: string
          recebeu_vt?: string
          recebido_em?: string | null
          status?: string
          substituto?: string
          substituto_person_id?: string | null
          supervisor?: string
          updated_at?: string
          valor_receber?: string
        }
        Update: {
          assinatura_colaborador?: string | null
          assinatura_em?: string | null
          assinatura_ip?: string | null
          assinatura_nome?: string | null
          assinatura_token?: string | null
          assinatura_token_expira_em?: string | null
          colaborador?: string
          created_at?: string
          criado_por?: string | null
          enviado_por_nome?: string | null
          fim?: string | null
          id?: string
          inicio?: string | null
          lancado_em?: string | null
          lancado_por?: string | null
          lancado_por_nome?: string | null
          motivo?: string
          person_id?: string | null
          posto_id?: string | null
          posto_nome?: string
          recebeu_refeicao?: string
          recebeu_vt?: string
          recebido_em?: string | null
          status?: string
          substituto?: string
          substituto_person_id?: string | null
          supervisor?: string
          updated_at?: string
          valor_receber?: string
        }
        Relationships: []
      }
      dados_extraidos_verificacao: {
        Row: {
          assinatura_digital_detectada: boolean
          atestado_id: string
          cid: string
          cid_descricao: string
          cnpj_estabelecimento: string
          codigo_validacao: string
          cpf: string
          created_at: string
          crm: string
          data_emissao: string
          data_fim_afastamento: string
          data_inicio_afastamento: string
          dias_afastamento: string
          hora_emissao: string
          id: string
          nome_clinica: string
          nome_medico: string
          nome_paciente: string
          qr_code_conteudo: string
          qr_code_detectado: boolean
          uf_crm: string
        }
        Insert: {
          assinatura_digital_detectada?: boolean
          atestado_id: string
          cid?: string
          cid_descricao?: string
          cnpj_estabelecimento?: string
          codigo_validacao?: string
          cpf?: string
          created_at?: string
          crm?: string
          data_emissao?: string
          data_fim_afastamento?: string
          data_inicio_afastamento?: string
          dias_afastamento?: string
          hora_emissao?: string
          id?: string
          nome_clinica?: string
          nome_medico?: string
          nome_paciente?: string
          qr_code_conteudo?: string
          qr_code_detectado?: boolean
          uf_crm?: string
        }
        Update: {
          assinatura_digital_detectada?: boolean
          atestado_id?: string
          cid?: string
          cid_descricao?: string
          cnpj_estabelecimento?: string
          codigo_validacao?: string
          cpf?: string
          created_at?: string
          crm?: string
          data_emissao?: string
          data_fim_afastamento?: string
          data_inicio_afastamento?: string
          dias_afastamento?: string
          hora_emissao?: string
          id?: string
          nome_clinica?: string
          nome_medico?: string
          nome_paciente?: string
          qr_code_conteudo?: string
          qr_code_detectado?: boolean
          uf_crm?: string
        }
        Relationships: [
          {
            foreignKeyName: "dados_extraidos_verificacao_atestado_id_fkey"
            columns: ["atestado_id"]
            isOneToOne: false
            referencedRelation: "atestados_verificados"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboards_config: {
        Row: {
          created_at: string
          dashboard: string
          sincronizacao_automatica: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          dashboard: string
          sincronizacao_automatica?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          dashboard?: string
          sincronizacao_automatica?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      faltas_arquivos: {
        Row: {
          caminho: string
          created_at: string
          id: string
          nome: string
          tamanho: number
          tipo: string
        }
        Insert: {
          caminho: string
          created_at?: string
          id?: string
          nome: string
          tamanho?: number
          tipo?: string
        }
        Update: {
          caminho?: string
          created_at?: string
          id?: string
          nome?: string
          tamanho?: number
          tipo?: string
        }
        Relationships: []
      }
      faltas_lancamentos: {
        Row: {
          assinatura: string
          cargo: string
          colaborador: string
          created_at: string
          created_by: string | null
          faltas: number
          gerente_nome: string
          id: string
          periodo: string
          posto: string
          tipo: string
          updated_at: string
        }
        Insert: {
          assinatura: string
          cargo?: string
          colaborador?: string
          created_at?: string
          created_by?: string | null
          faltas?: number
          gerente_nome: string
          id?: string
          periodo?: string
          posto?: string
          tipo?: string
          updated_at?: string
        }
        Update: {
          assinatura?: string
          cargo?: string
          colaborador?: string
          created_at?: string
          created_by?: string | null
          faltas?: number
          gerente_nome?: string
          id?: string
          periodo?: string
          posto?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      faltas_sem_cobertura: {
        Row: {
          cargo: string
          cobertura: string
          created_at: string
          data: string | null
          empresa: string
          horario: string
          id: string
          motivo: string
          nome: string
          posto: string
          user_id: string
        }
        Insert: {
          cargo?: string
          cobertura?: string
          created_at?: string
          data?: string | null
          empresa?: string
          horario?: string
          id?: string
          motivo?: string
          nome?: string
          posto?: string
          user_id: string
        }
        Update: {
          cargo?: string
          cobertura?: string
          created_at?: string
          data?: string | null
          empresa?: string
          horario?: string
          id?: string
          motivo?: string
          nome?: string
          posto?: string
          user_id?: string
        }
        Relationships: []
      }
      funcionarios_ativos: {
        Row: {
          ativo: boolean
          cargo: string
          created_at: string
          created_by: string | null
          empresa: string
          empresa_normalizada: string
          id: string
          matricula: string
          nome: string
          nome_normalizado: string
          posto: string
          revisar: boolean
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cargo?: string
          created_at?: string
          created_by?: string | null
          empresa?: string
          empresa_normalizada?: string
          id?: string
          matricula?: string
          nome: string
          nome_normalizado?: string
          posto?: string
          revisar?: boolean
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cargo?: string
          created_at?: string
          created_by?: string | null
          empresa?: string
          empresa_normalizada?: string
          id?: string
          matricula?: string
          nome?: string
          nome_normalizado?: string
          posto?: string
          revisar?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      gerentes: {
        Row: {
          cargo: string
          created_at: string
          email: string | null
          id: string
          nome: string
        }
        Insert: {
          cargo?: string
          created_at?: string
          email?: string | null
          id?: string
          nome: string
        }
        Update: {
          cargo?: string
          created_at?: string
          email?: string | null
          id?: string
          nome?: string
        }
        Relationships: []
      }
      historico_analises_atestado: {
        Row: {
          acao: string
          atestado_id: string
          created_at: string
          id: string
          observacao: string | null
          usuario_id: string | null
          usuario_nome: string
        }
        Insert: {
          acao: string
          atestado_id: string
          created_at?: string
          id?: string
          observacao?: string | null
          usuario_id?: string | null
          usuario_nome?: string
        }
        Update: {
          acao?: string
          atestado_id?: string
          created_at?: string
          id?: string
          observacao?: string | null
          usuario_id?: string | null
          usuario_nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "historico_analises_atestado_atestado_id_fkey"
            columns: ["atestado_id"]
            isOneToOne: false
            referencedRelation: "atestados_verificados"
            referencedColumns: ["id"]
          },
        ]
      }
      ia_training_data: {
        Row: {
          active: boolean
          answer: string | null
          category: string
          content: string
          created_at: string
          id: string
          question: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          answer?: string | null
          category?: string
          content: string
          created_at?: string
          id?: string
          question?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          answer?: string | null
          category?: string
          content?: string
          created_at?: string
          id?: string
          question?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      inconsistencias_atestado: {
        Row: {
          atestado_id: string
          created_at: string
          descricao: string
          id: string
          severidade: string
          tipo: string
        }
        Insert: {
          atestado_id: string
          created_at?: string
          descricao: string
          id?: string
          severidade?: string
          tipo: string
        }
        Update: {
          atestado_id?: string
          created_at?: string
          descricao?: string
          id?: string
          severidade?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "inconsistencias_atestado_atestado_id_fkey"
            columns: ["atestado_id"]
            isOneToOne: false
            referencedRelation: "atestados_verificados"
            referencedColumns: ["id"]
          },
        ]
      }
      known_error_solutions: {
        Row: {
          active: boolean
          authorized_solution: string
          created_at: string
          description: string
          error_signature: string
          id: string
          max_retries: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          authorized_solution: string
          created_at?: string
          description: string
          error_signature: string
          id?: string
          max_retries?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          authorized_solution?: string
          created_at?: string
          description?: string
          error_signature?: string
          id?: string
          max_retries?: number
          updated_at?: string
        }
        Relationships: []
      }
      lgpd_acessos: {
        Row: {
          acao: string
          base_legal: string
          created_at: string
          detalhes: Json
          finalidade: string
          id: string
          modulo: string
          recurso: string
          titular_ref: string
          user_id: string | null
        }
        Insert: {
          acao?: string
          base_legal?: string
          created_at?: string
          detalhes?: Json
          finalidade?: string
          id?: string
          modulo?: string
          recurso: string
          titular_ref?: string
          user_id?: string | null
        }
        Update: {
          acao?: string
          base_legal?: string
          created_at?: string
          detalhes?: Json
          finalidade?: string
          id?: string
          modulo?: string
          recurso?: string
          titular_ref?: string
          user_id?: string | null
        }
        Relationships: []
      }
      lgpd_config: {
        Row: {
          anonimizar_apos_retencao: boolean
          banner_consentimento_ativo: boolean
          controlador: string
          controlador_cnpj: string
          encarregado_email: string
          encarregado_nome: string
          encarregado_telefone: string
          id: boolean
          politica_texto: string
          politica_versao: string
          prazo_resposta_dias: number
          retencao_atestados_dias: number
          retencao_chat_dias: number
          retencao_folhas_dias: number
          retencao_logs_dias: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          anonimizar_apos_retencao?: boolean
          banner_consentimento_ativo?: boolean
          controlador?: string
          controlador_cnpj?: string
          encarregado_email?: string
          encarregado_nome?: string
          encarregado_telefone?: string
          id?: boolean
          politica_texto?: string
          politica_versao?: string
          prazo_resposta_dias?: number
          retencao_atestados_dias?: number
          retencao_chat_dias?: number
          retencao_folhas_dias?: number
          retencao_logs_dias?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          anonimizar_apos_retencao?: boolean
          banner_consentimento_ativo?: boolean
          controlador?: string
          controlador_cnpj?: string
          encarregado_email?: string
          encarregado_nome?: string
          encarregado_telefone?: string
          id?: boolean
          politica_texto?: string
          politica_versao?: string
          prazo_resposta_dias?: number
          retencao_atestados_dias?: number
          retencao_chat_dias?: number
          retencao_folhas_dias?: number
          retencao_logs_dias?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      lgpd_consents: {
        Row: {
          aceito: boolean
          base_legal: string
          created_at: string
          finalidade: string
          id: string
          ip_address: string | null
          politica_versao: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          aceito?: boolean
          base_legal?: string
          created_at?: string
          finalidade: string
          id?: string
          ip_address?: string | null
          politica_versao?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          aceito?: boolean
          base_legal?: string
          created_at?: string
          finalidade?: string
          id?: string
          ip_address?: string | null
          politica_versao?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      lgpd_incidentes: {
        Row: {
          comunicado_anpd: boolean
          comunicado_em: string | null
          created_at: string
          created_by: string | null
          dados_afetados: string
          descricao: string
          detectado_em: string
          id: string
          medidas: string
          severidade: string
          status: string
          titulares_afetados: number
          titulo: string
          updated_at: string
        }
        Insert: {
          comunicado_anpd?: boolean
          comunicado_em?: string | null
          created_at?: string
          created_by?: string | null
          dados_afetados?: string
          descricao?: string
          detectado_em?: string
          id?: string
          medidas?: string
          severidade?: string
          status?: string
          titulares_afetados?: number
          titulo: string
          updated_at?: string
        }
        Update: {
          comunicado_anpd?: boolean
          comunicado_em?: string | null
          created_at?: string
          created_by?: string | null
          dados_afetados?: string
          descricao?: string
          detectado_em?: string
          id?: string
          medidas?: string
          severidade?: string
          status?: string
          titulares_afetados?: number
          titulo?: string
          updated_at?: string
        }
        Relationships: []
      }
      lgpd_solicitacoes: {
        Row: {
          created_at: string
          descricao: string
          id: string
          prazo_em: string
          respondido_em: string | null
          respondido_por: string | null
          resposta: string
          status: string
          tipo: string
          titular_email: string
          titular_nome: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          descricao?: string
          id?: string
          prazo_em?: string
          respondido_em?: string | null
          respondido_por?: string | null
          resposta?: string
          status?: string
          tipo?: string
          titular_email?: string
          titular_nome?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          descricao?: string
          id?: string
          prazo_em?: string
          respondido_em?: string | null
          respondido_por?: string | null
          resposta?: string
          status?: string
          tipo?: string
          titular_email?: string
          titular_nome?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      logs_acesso_atestado: {
        Row: {
          acao: string
          atestado_id: string
          created_at: string
          id: string
          ip_address: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          acao: string
          atestado_id: string
          created_at?: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          acao?: string
          atestado_id?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "logs_acesso_atestado_atestado_id_fkey"
            columns: ["atestado_id"]
            isOneToOne: false
            referencedRelation: "atestados_verificados"
            referencedColumns: ["id"]
          },
        ]
      }
      monitor_cron: {
        Row: {
          created_at: string
          id: string
          token: string
        }
        Insert: {
          created_at?: string
          id?: string
          token: string
        }
        Update: {
          created_at?: string
          id?: string
          token?: string
        }
        Relationships: []
      }
      monitor_errors: {
        Row: {
          created_at: string
          enviado: boolean
          id: string
          mensagem: string
          origem: string | null
          rota: string | null
          status_http: number | null
          tipo: string
        }
        Insert: {
          created_at?: string
          enviado?: boolean
          id?: string
          mensagem: string
          origem?: string | null
          rota?: string | null
          status_http?: number | null
          tipo: string
        }
        Update: {
          created_at?: string
          enviado?: boolean
          id?: string
          mensagem?: string
          origem?: string | null
          rota?: string | null
          status_http?: number | null
          tipo?: string
        }
        Relationships: []
      }
      monitor_heartbeats: {
        Row: {
          ambiente: string | null
          checks: Json | null
          created_at: string
          erro: string | null
          id: string
          latency_ms: number | null
          ok: boolean
          status: string
          tentativas: number
          versao: string | null
        }
        Insert: {
          ambiente?: string | null
          checks?: Json | null
          created_at?: string
          erro?: string | null
          id?: string
          latency_ms?: number | null
          ok?: boolean
          status: string
          tentativas?: number
          versao?: string | null
        }
        Update: {
          ambiente?: string | null
          checks?: Json | null
          created_at?: string
          erro?: string | null
          id?: string
          latency_ms?: number | null
          ok?: boolean
          status?: string
          tentativas?: number
          versao?: string | null
        }
        Relationships: []
      }
      monitor_recovery_log: {
        Row: {
          acao: string
          created_at: string
          detalhe: string | null
          id: string
          resultado: string
        }
        Insert: {
          acao: string
          created_at?: string
          detalhe?: string | null
          id?: string
          resultado: string
        }
        Update: {
          acao?: string
          created_at?: string
          detalhe?: string | null
          id?: string
          resultado?: string
        }
        Relationships: []
      }
      monitoring_pings: {
        Row: {
          created_at: string
          duracao_ms: number | null
          endpoint: string
          id: string
          ip: string | null
          status: number
          token_id: string | null
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          duracao_ms?: number | null
          endpoint?: string
          id?: string
          ip?: string | null
          status?: number
          token_id?: string | null
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          duracao_ms?: number | null
          endpoint?: string
          id?: string
          ip?: string | null
          status?: number
          token_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "monitoring_pings_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "monitoring_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      monitoring_tokens: {
        Row: {
          created_at: string
          criado_por: string | null
          id: string
          last_used_at: string | null
          nome: string
          prefixo: string
          revogado_em: string | null
          token_hash: string
          total_requisicoes: number
        }
        Insert: {
          created_at?: string
          criado_por?: string | null
          id?: string
          last_used_at?: string | null
          nome: string
          prefixo?: string
          revogado_em?: string | null
          token_hash: string
          total_requisicoes?: number
        }
        Update: {
          created_at?: string
          criado_por?: string | null
          id?: string
          last_used_at?: string | null
          nome?: string
          prefixo?: string
          revogado_em?: string | null
          token_hash?: string
          total_requisicoes?: number
        }
        Relationships: []
      }
      movimentacoes_posto: {
        Row: {
          aprovado_em: string | null
          aprovado_por: string | null
          aprovado_por_nome: string | null
          assinatura_colaborador: string | null
          assinatura_declaracao: boolean
          assinatura_dispositivo: string | null
          assinatura_em: string | null
          assinatura_geo_status: string | null
          assinatura_ip: string | null
          assinatura_latitude: number | null
          assinatura_longitude: number | null
          assinatura_nome: string | null
          assinatura_precisao_metros: number | null
          assinatura_token: string | null
          assinatura_token_expira_em: string | null
          cargo: string | null
          colaborador: string
          created_at: string
          criado_por: string
          criado_por_nome: string | null
          data_movimentacao: string
          enviado_nexti_em: string | null
          id: string
          motivo: string
          motivo_recusa: string | null
          nexti_http_status: number | null
          nexti_transfer_id: string | null
          novo_posto: string
          novo_posto_external_id: string | null
          novo_posto_id: string | null
          person_external_id: string | null
          person_id: string | null
          posto_atual: string
          posto_atual_id: string | null
          protocolo: string
          status: string
          updated_at: string
          validacao_detalhe: string | null
        }
        Insert: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          aprovado_por_nome?: string | null
          assinatura_colaborador?: string | null
          assinatura_declaracao?: boolean
          assinatura_dispositivo?: string | null
          assinatura_em?: string | null
          assinatura_geo_status?: string | null
          assinatura_ip?: string | null
          assinatura_latitude?: number | null
          assinatura_longitude?: number | null
          assinatura_nome?: string | null
          assinatura_precisao_metros?: number | null
          assinatura_token?: string | null
          assinatura_token_expira_em?: string | null
          cargo?: string | null
          colaborador: string
          created_at?: string
          criado_por: string
          criado_por_nome?: string | null
          data_movimentacao: string
          enviado_nexti_em?: string | null
          id?: string
          motivo?: string
          motivo_recusa?: string | null
          nexti_http_status?: number | null
          nexti_transfer_id?: string | null
          novo_posto: string
          novo_posto_external_id?: string | null
          novo_posto_id?: string | null
          person_external_id?: string | null
          person_id?: string | null
          posto_atual: string
          posto_atual_id?: string | null
          protocolo: string
          status?: string
          updated_at?: string
          validacao_detalhe?: string | null
        }
        Update: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          aprovado_por_nome?: string | null
          assinatura_colaborador?: string | null
          assinatura_declaracao?: boolean
          assinatura_dispositivo?: string | null
          assinatura_em?: string | null
          assinatura_geo_status?: string | null
          assinatura_ip?: string | null
          assinatura_latitude?: number | null
          assinatura_longitude?: number | null
          assinatura_nome?: string | null
          assinatura_precisao_metros?: number | null
          assinatura_token?: string | null
          assinatura_token_expira_em?: string | null
          cargo?: string | null
          colaborador?: string
          created_at?: string
          criado_por?: string
          criado_por_nome?: string | null
          data_movimentacao?: string
          enviado_nexti_em?: string | null
          id?: string
          motivo?: string
          motivo_recusa?: string | null
          nexti_http_status?: number | null
          nexti_transfer_id?: string | null
          novo_posto?: string
          novo_posto_external_id?: string | null
          novo_posto_id?: string | null
          person_external_id?: string | null
          person_id?: string | null
          posto_atual?: string
          posto_atual_id?: string | null
          protocolo?: string
          status?: string
          updated_at?: string
          validacao_detalhe?: string | null
        }
        Relationships: []
      }
      nexti_absences: {
        Row: {
          absence_situation_external_id: string | null
          absence_situation_id: number | null
          cid_code: string | null
          cid_description: string | null
          created_at: string
          finish_date_time: string | null
          id: string
          last_synced_at: string
          last_update: string | null
          medical_doctor_crm: string | null
          medical_doctor_name: string | null
          nexti_id: number
          note: string | null
          person_external_id: string | null
          person_id: number | null
          raw_payload: Json
          removed: boolean
          start_date_time: string | null
          updated_at: string
        }
        Insert: {
          absence_situation_external_id?: string | null
          absence_situation_id?: number | null
          cid_code?: string | null
          cid_description?: string | null
          created_at?: string
          finish_date_time?: string | null
          id?: string
          last_synced_at?: string
          last_update?: string | null
          medical_doctor_crm?: string | null
          medical_doctor_name?: string | null
          nexti_id: number
          note?: string | null
          person_external_id?: string | null
          person_id?: number | null
          raw_payload?: Json
          removed?: boolean
          start_date_time?: string | null
          updated_at?: string
        }
        Update: {
          absence_situation_external_id?: string | null
          absence_situation_id?: number | null
          cid_code?: string | null
          cid_description?: string | null
          created_at?: string
          finish_date_time?: string | null
          id?: string
          last_synced_at?: string
          last_update?: string | null
          medical_doctor_crm?: string | null
          medical_doctor_name?: string | null
          nexti_id?: number
          note?: string | null
          person_external_id?: string | null
          person_id?: number | null
          raw_payload?: Json
          removed?: boolean
          start_date_time?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      nexti_areas: {
        Row: {
          created_at: string
          external_id: string | null
          id: string
          last_synced_at: string
          name: string | null
          nexti_id: number
          raw_payload: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          external_id?: string | null
          id?: string
          last_synced_at?: string
          name?: string | null
          nexti_id: number
          raw_payload?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          external_id?: string | null
          id?: string
          last_synced_at?: string
          name?: string | null
          nexti_id?: number
          raw_payload?: Json
          updated_at?: string
        }
        Relationships: []
      }
      nexti_careers: {
        Row: {
          career_group_name: string | null
          created_at: string
          external_id: string | null
          id: string
          last_synced_at: string
          name: string | null
          nexti_id: number
          raw_payload: Json
          updated_at: string
        }
        Insert: {
          career_group_name?: string | null
          created_at?: string
          external_id?: string | null
          id?: string
          last_synced_at?: string
          name?: string | null
          nexti_id: number
          raw_payload?: Json
          updated_at?: string
        }
        Update: {
          career_group_name?: string | null
          created_at?: string
          external_id?: string | null
          id?: string
          last_synced_at?: string
          name?: string | null
          nexti_id?: number
          raw_payload?: Json
          updated_at?: string
        }
        Relationships: []
      }
      nexti_checklist_answers: {
        Row: {
          answer_date: string | null
          checklist_id: number | null
          checklist_name: string | null
          checklist_type_id: number | null
          cidade: string | null
          cliente: string | null
          conformes: number
          created_at: string
          device_code: string | null
          id: string
          itens: Json
          last_synced_at: string
          nao_conformes: number
          nexti_id: number
          person_id: number | null
          raw_payload: Json
          reference_date: string | null
          register_date: string | null
          supervisor_nome: string | null
          total_perguntas: number
          uf: string | null
          updated_at: string
          workplace_id: number | null
          workplace_name: string | null
        }
        Insert: {
          answer_date?: string | null
          checklist_id?: number | null
          checklist_name?: string | null
          checklist_type_id?: number | null
          cidade?: string | null
          cliente?: string | null
          conformes?: number
          created_at?: string
          device_code?: string | null
          id?: string
          itens?: Json
          last_synced_at?: string
          nao_conformes?: number
          nexti_id: number
          person_id?: number | null
          raw_payload?: Json
          reference_date?: string | null
          register_date?: string | null
          supervisor_nome?: string | null
          total_perguntas?: number
          uf?: string | null
          updated_at?: string
          workplace_id?: number | null
          workplace_name?: string | null
        }
        Update: {
          answer_date?: string | null
          checklist_id?: number | null
          checklist_name?: string | null
          checklist_type_id?: number | null
          cidade?: string | null
          cliente?: string | null
          conformes?: number
          created_at?: string
          device_code?: string | null
          id?: string
          itens?: Json
          last_synced_at?: string
          nao_conformes?: number
          nexti_id?: number
          person_id?: number | null
          raw_payload?: Json
          reference_date?: string | null
          register_date?: string | null
          supervisor_nome?: string | null
          total_perguntas?: number
          uf?: string | null
          updated_at?: string
          workplace_id?: number | null
          workplace_name?: string | null
        }
        Relationships: []
      }
      nexti_checklists: {
        Row: {
          checklist_type_id: number | null
          created_at: string
          finish_date_time: string | null
          id: string
          last_synced_at: string
          name: string | null
          nexti_id: number
          questions: Json
          raw_payload: Json
          start_date_time: string | null
          status_id: number | null
          updated_at: string
          workplace_ids: number[]
        }
        Insert: {
          checklist_type_id?: number | null
          created_at?: string
          finish_date_time?: string | null
          id?: string
          last_synced_at?: string
          name?: string | null
          nexti_id: number
          questions?: Json
          raw_payload?: Json
          start_date_time?: string | null
          status_id?: number | null
          updated_at?: string
          workplace_ids?: number[]
        }
        Update: {
          checklist_type_id?: number | null
          created_at?: string
          finish_date_time?: string | null
          id?: string
          last_synced_at?: string
          name?: string | null
          nexti_id?: number
          questions?: Json
          raw_payload?: Json
          start_date_time?: string | null
          status_id?: number | null
          updated_at?: string
          workplace_ids?: number[]
        }
        Relationships: []
      }
      nexti_clockings: {
        Row: {
          clocking_collector_name: string | null
          clocking_date: string | null
          clocking_type_id: number | null
          clocking_type_name: string | null
          created_at: string
          external_person_id: string | null
          external_workplace_id: string | null
          id: string
          last_synced_at: string
          last_update: string | null
          nexti_id: number
          person_id: number | null
          person_name: string | null
          raw_payload: Json
          reference_date: string | null
          removed: boolean
          updated_at: string
          workplace_id: number | null
        }
        Insert: {
          clocking_collector_name?: string | null
          clocking_date?: string | null
          clocking_type_id?: number | null
          clocking_type_name?: string | null
          created_at?: string
          external_person_id?: string | null
          external_workplace_id?: string | null
          id?: string
          last_synced_at?: string
          last_update?: string | null
          nexti_id: number
          person_id?: number | null
          person_name?: string | null
          raw_payload?: Json
          reference_date?: string | null
          removed?: boolean
          updated_at?: string
          workplace_id?: number | null
        }
        Update: {
          clocking_collector_name?: string | null
          clocking_date?: string | null
          clocking_type_id?: number | null
          clocking_type_name?: string | null
          created_at?: string
          external_person_id?: string | null
          external_workplace_id?: string | null
          id?: string
          last_synced_at?: string
          last_update?: string | null
          nexti_id?: number
          person_id?: number | null
          person_name?: string | null
          raw_payload?: Json
          reference_date?: string | null
          removed?: boolean
          updated_at?: string
          workplace_id?: number | null
        }
        Relationships: []
      }
      nexti_companies: {
        Row: {
          active: boolean | null
          company_name: string | null
          company_number: string | null
          created_at: string
          external_id: string | null
          fantasy_name: string | null
          id: string
          last_synced_at: string
          nexti_id: number
          raw_payload: Json
          updated_at: string
        }
        Insert: {
          active?: boolean | null
          company_name?: string | null
          company_number?: string | null
          created_at?: string
          external_id?: string | null
          fantasy_name?: string | null
          id?: string
          last_synced_at?: string
          nexti_id: number
          raw_payload?: Json
          updated_at?: string
        }
        Update: {
          active?: boolean | null
          company_name?: string | null
          company_number?: string | null
          created_at?: string
          external_id?: string | null
          fantasy_name?: string | null
          id?: string
          last_synced_at?: string
          nexti_id?: number
          raw_payload?: Json
          updated_at?: string
        }
        Relationships: []
      }
      nexti_config: {
        Row: {
          base_url: string
          client_id: string
          client_secret: string
          enabled: boolean
          id: boolean
          test_endpoint: string
          token: string
          token_endpoint: string
          updated_at: string
          updated_by: string | null
          username: string
        }
        Insert: {
          base_url?: string
          client_id?: string
          client_secret?: string
          enabled?: boolean
          id?: boolean
          test_endpoint?: string
          token?: string
          token_endpoint?: string
          updated_at?: string
          updated_by?: string | null
          username?: string
        }
        Update: {
          base_url?: string
          client_id?: string
          client_secret?: string
          enabled?: boolean
          id?: boolean
          test_endpoint?: string
          token?: string
          token_endpoint?: string
          updated_at?: string
          updated_by?: string | null
          username?: string
        }
        Relationships: []
      }
      nexti_document_types: {
        Row: {
          created_at: string
          id: string
          is_atestado: boolean
          name: string | null
          nexti_id: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_atestado?: boolean
          name?: string | null
          nexti_id: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_atestado?: boolean
          name?: string | null
          nexti_id?: number
          updated_at?: string
        }
        Relationships: []
      }
      nexti_documents: {
        Row: {
          created_at: string
          document_type_customer_id: number | null
          document_type_customer_name: string | null
          document_url: string | null
          due_date: string | null
          id: string
          issue_date: string | null
          last_synced_at: string
          nexti_id: number
          note: string | null
          person_id: number | null
          raw_payload: Json
          updated_at: string
          workplace_id: number | null
        }
        Insert: {
          created_at?: string
          document_type_customer_id?: number | null
          document_type_customer_name?: string | null
          document_url?: string | null
          due_date?: string | null
          id?: string
          issue_date?: string | null
          last_synced_at?: string
          nexti_id: number
          note?: string | null
          person_id?: number | null
          raw_payload?: Json
          updated_at?: string
          workplace_id?: number | null
        }
        Update: {
          created_at?: string
          document_type_customer_id?: number | null
          document_type_customer_name?: string | null
          document_url?: string | null
          due_date?: string | null
          id?: string
          issue_date?: string | null
          last_synced_at?: string
          nexti_id?: number
          note?: string | null
          person_id?: number | null
          raw_payload?: Json
          updated_at?: string
          workplace_id?: number | null
        }
        Relationships: []
      }
      nexti_persons: {
        Row: {
          admission_date: string | null
          career_id: number | null
          career_name: string | null
          company_id: number | null
          created_at: string
          demission_date: string | null
          external_id: string | null
          id: string
          last_synced_at: string
          matricula: string | null
          nexti_id: number
          nome: string | null
          raw_payload: Json
          situacao: string | null
          situacao_id: number | null
          updated_at: string
          workplace_id: number | null
          workplace_name: string | null
        }
        Insert: {
          admission_date?: string | null
          career_id?: number | null
          career_name?: string | null
          company_id?: number | null
          created_at?: string
          demission_date?: string | null
          external_id?: string | null
          id?: string
          last_synced_at?: string
          matricula?: string | null
          nexti_id: number
          nome?: string | null
          raw_payload?: Json
          situacao?: string | null
          situacao_id?: number | null
          updated_at?: string
          workplace_id?: number | null
          workplace_name?: string | null
        }
        Update: {
          admission_date?: string | null
          career_id?: number | null
          career_name?: string | null
          company_id?: number | null
          created_at?: string
          demission_date?: string | null
          external_id?: string | null
          id?: string
          last_synced_at?: string
          matricula?: string | null
          nexti_id?: number
          nome?: string | null
          raw_payload?: Json
          situacao?: string | null
          situacao_id?: number | null
          updated_at?: string
          workplace_id?: number | null
          workplace_name?: string | null
        }
        Relationships: []
      }
      nexti_sync_errors: {
        Row: {
          created_at: string
          etapa: string | null
          id: string
          mensagem: string
          modulo: string
          run_id: string | null
          status_http: number | null
        }
        Insert: {
          created_at?: string
          etapa?: string | null
          id?: string
          mensagem: string
          modulo: string
          run_id?: string | null
          status_http?: number | null
        }
        Update: {
          created_at?: string
          etapa?: string | null
          id?: string
          mensagem?: string
          modulo?: string
          run_id?: string | null
          status_http?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "nexti_sync_errors_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "nexti_sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      nexti_sync_runs: {
        Row: {
          atualizados: number
          com_erro: number
          created_at: string
          finalizado_em: string | null
          id: string
          ignorados: number
          importados: number
          iniciado_em: string
          mensagem: string | null
          modo: string
          modulo: string
          paginas: number
          status: string
          updated_at: string
          usuario_id: string | null
        }
        Insert: {
          atualizados?: number
          com_erro?: number
          created_at?: string
          finalizado_em?: string | null
          id?: string
          ignorados?: number
          importados?: number
          iniciado_em?: string
          mensagem?: string | null
          modo?: string
          modulo: string
          paginas?: number
          status?: string
          updated_at?: string
          usuario_id?: string | null
        }
        Update: {
          atualizados?: number
          com_erro?: number
          created_at?: string
          finalizado_em?: string | null
          id?: string
          ignorados?: number
          importados?: number
          iniciado_em?: string
          mensagem?: string | null
          modo?: string
          modulo?: string
          paginas?: number
          status?: string
          updated_at?: string
          usuario_id?: string | null
        }
        Relationships: []
      }
      nexti_workplaces: {
        Row: {
          active: boolean | null
          address: string | null
          address_number: string | null
          city: string | null
          client_name: string | null
          closing_reason: string | null
          company_id: number | null
          company_name: string | null
          cost_center: string | null
          created_at: string
          department: string | null
          district: string | null
          external_id: string | null
          finish_date: string | null
          id: string
          last_synced_at: string
          latitude: number | null
          longitude: number | null
          manager_name: string | null
          name: string | null
          nexti_id: number
          phone: string | null
          raw_payload: Json
          state: string | null
          updated_at: string
          zip_code: string | null
        }
        Insert: {
          active?: boolean | null
          address?: string | null
          address_number?: string | null
          city?: string | null
          client_name?: string | null
          closing_reason?: string | null
          company_id?: number | null
          company_name?: string | null
          cost_center?: string | null
          created_at?: string
          department?: string | null
          district?: string | null
          external_id?: string | null
          finish_date?: string | null
          id?: string
          last_synced_at?: string
          latitude?: number | null
          longitude?: number | null
          manager_name?: string | null
          name?: string | null
          nexti_id: number
          phone?: string | null
          raw_payload?: Json
          state?: string | null
          updated_at?: string
          zip_code?: string | null
        }
        Update: {
          active?: boolean | null
          address?: string | null
          address_number?: string | null
          city?: string | null
          client_name?: string | null
          closing_reason?: string | null
          company_id?: number | null
          company_name?: string | null
          cost_center?: string | null
          created_at?: string
          department?: string | null
          district?: string | null
          external_id?: string | null
          finish_date?: string | null
          id?: string
          last_synced_at?: string
          latitude?: number | null
          longitude?: number | null
          manager_name?: string | null
          name?: string | null
          nexti_id?: number
          phone?: string | null
          raw_payload?: Json
          state?: string | null
          updated_at?: string
          zip_code?: string | null
        }
        Relationships: []
      }
      notification_history: {
        Row: {
          body: string
          category: string
          created_at: string
          deduplication_key: string | null
          error_message: string | null
          event_type: string
          failed_count: number
          id: string
          metadata: Json
          read_at: string | null
          sent_count: number
          status: string
          target_url: string | null
          title: string
          user_id: string
        }
        Insert: {
          body: string
          category: string
          created_at?: string
          deduplication_key?: string | null
          error_message?: string | null
          event_type: string
          failed_count?: number
          id?: string
          metadata?: Json
          read_at?: string | null
          sent_count?: number
          status?: string
          target_url?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string
          category?: string
          created_at?: string
          deduplication_key?: string | null
          error_message?: string | null
          event_type?: string
          failed_count?: number
          id?: string
          metadata?: Json
          read_at?: string | null
          sent_count?: number
          status?: string
          target_url?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          atestados: boolean
          chat: boolean
          created_at: string
          documentos: boolean
          faltas: boolean
          id: string
          nexti: boolean
          protocolos: boolean
          quiet_hours_enabled: boolean
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          sistema: boolean
          sound_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          atestados?: boolean
          chat?: boolean
          created_at?: string
          documentos?: boolean
          faltas?: boolean
          id?: string
          nexti?: boolean
          protocolos?: boolean
          quiet_hours_enabled?: boolean
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          sistema?: boolean
          sound_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          atestados?: boolean
          chat?: boolean
          created_at?: string
          documentos?: boolean
          faltas?: boolean
          id?: string
          nexti?: boolean
          protocolos?: boolean
          quiet_hours_enabled?: boolean
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          sistema?: boolean
          sound_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      nxs_alerts: {
        Row: {
          codigo: string
          company_id: string
          created_at: string
          created_by: string | null
          descricao: string | null
          device_id: string | null
          employee_id: string | null
          encerrado_em: string | null
          id: string
          latitude: number | null
          longitude: number | null
          motivo_encerramento: string | null
          prazo_em: string | null
          prioridade: string
          responsavel_id: string | null
          status: Database["public"]["Enums"]["nxs_alert_status"]
          tipo: string
          updated_at: string
        }
        Insert: {
          codigo?: string
          company_id: string
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          device_id?: string | null
          employee_id?: string | null
          encerrado_em?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          motivo_encerramento?: string | null
          prazo_em?: string | null
          prioridade?: string
          responsavel_id?: string | null
          status?: Database["public"]["Enums"]["nxs_alert_status"]
          tipo: string
          updated_at?: string
        }
        Update: {
          codigo?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          device_id?: string | null
          employee_id?: string | null
          encerrado_em?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          motivo_encerramento?: string | null
          prazo_em?: string | null
          prioridade?: string
          responsavel_id?: string | null
          status?: Database["public"]["Enums"]["nxs_alert_status"]
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nxs_alerts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "nxs_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nxs_alerts_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "nxs_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nxs_alerts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "nxs_employees"
            referencedColumns: ["id"]
          },
        ]
      }
      nxs_audit_logs: {
        Row: {
          acao: string
          company_id: string | null
          created_at: string
          detalhes: Json | null
          entidade: string | null
          entidade_id: string | null
          id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          acao: string
          company_id?: string | null
          created_at?: string
          detalhes?: Json | null
          entidade?: string | null
          entidade_id?: string | null
          id?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          acao?: string
          company_id?: string | null
          created_at?: string
          detalhes?: Json | null
          entidade?: string | null
          entidade_id?: string | null
          id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nxs_audit_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "nxs_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      nxs_companies: {
        Row: {
          ativo: boolean
          cnpj: string | null
          created_at: string
          created_by: string | null
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cnpj?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cnpj?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      nxs_company_members: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          papel: Database["public"]["Enums"]["nxs_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          papel?: Database["public"]["Enums"]["nxs_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          papel?: Database["public"]["Enums"]["nxs_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nxs_company_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "nxs_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      nxs_devices: {
        Row: {
          bateria: number | null
          codigo: string
          company_id: string
          created_at: string
          created_by: string | null
          employee_id: string | null
          firmware: string | null
          id: string
          imei: string | null
          ingest_token: string
          instalado_em: string | null
          modelo: string | null
          numero_serie: string | null
          precisao_gps: number | null
          sim: string | null
          status: Database["public"]["Enums"]["nxs_device_status"]
          tipo: string
          ultima_comunicacao: string | null
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          bateria?: number | null
          codigo: string
          company_id: string
          created_at?: string
          created_by?: string | null
          employee_id?: string | null
          firmware?: string | null
          id?: string
          imei?: string | null
          ingest_token?: string
          instalado_em?: string | null
          modelo?: string | null
          numero_serie?: string | null
          precisao_gps?: number | null
          sim?: string | null
          status?: Database["public"]["Enums"]["nxs_device_status"]
          tipo?: string
          ultima_comunicacao?: string | null
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          bateria?: number | null
          codigo?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          employee_id?: string | null
          firmware?: string | null
          id?: string
          imei?: string | null
          ingest_token?: string
          instalado_em?: string | null
          modelo?: string | null
          numero_serie?: string | null
          precisao_gps?: number | null
          sim?: string | null
          status?: Database["public"]["Enums"]["nxs_device_status"]
          tipo?: string
          ultima_comunicacao?: string | null
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nxs_devices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "nxs_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nxs_devices_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "nxs_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nxs_devices_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "nxs_vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      nxs_employees: {
        Row: {
          cargo: string | null
          company_id: string
          cpf: string | null
          created_at: string
          created_by: string | null
          data_admissao: string | null
          departamento: string | null
          email: string | null
          external_id: string | null
          foto_url: string | null
          funcao: string
          id: string
          jornada: string | null
          matricula: string | null
          nome: string
          rastreamento_permitido: boolean
          status: string
          supervisor_id: string | null
          telefone: string | null
          unidade: string | null
          updated_at: string
          user_id: string | null
          vehicle_id: string | null
        }
        Insert: {
          cargo?: string | null
          company_id: string
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          data_admissao?: string | null
          departamento?: string | null
          email?: string | null
          external_id?: string | null
          foto_url?: string | null
          funcao?: string
          id?: string
          jornada?: string | null
          matricula?: string | null
          nome: string
          rastreamento_permitido?: boolean
          status?: string
          supervisor_id?: string | null
          telefone?: string | null
          unidade?: string | null
          updated_at?: string
          user_id?: string | null
          vehicle_id?: string | null
        }
        Update: {
          cargo?: string | null
          company_id?: string
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          data_admissao?: string | null
          departamento?: string | null
          email?: string | null
          external_id?: string | null
          foto_url?: string | null
          funcao?: string
          id?: string
          jornada?: string | null
          matricula?: string | null
          nome?: string
          rastreamento_permitido?: boolean
          status?: string
          supervisor_id?: string | null
          telefone?: string | null
          unidade?: string | null
          updated_at?: string
          user_id?: string | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nxs_employees_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "nxs_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nxs_employees_supervisor_id_fkey"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "nxs_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nxs_employees_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "nxs_vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      nxs_location_events: {
        Row: {
          bateria: number | null
          company_id: string
          created_at: string
          device_id: string | null
          direcao: number | null
          employee_id: string | null
          id: string
          latitude: number
          longitude: number
          origem: string
          precisao: number | null
          recebido_em: string
          registrado_em: string
          updated_at: string
          vehicle_id: string | null
          velocidade: number | null
        }
        Insert: {
          bateria?: number | null
          company_id: string
          created_at?: string
          device_id?: string | null
          direcao?: number | null
          employee_id?: string | null
          id?: string
          latitude: number
          longitude: number
          origem?: string
          precisao?: number | null
          recebido_em?: string
          registrado_em?: string
          updated_at?: string
          vehicle_id?: string | null
          velocidade?: number | null
        }
        Update: {
          bateria?: number | null
          company_id?: string
          created_at?: string
          device_id?: string | null
          direcao?: number | null
          employee_id?: string | null
          id?: string
          latitude?: number
          longitude?: number
          origem?: string
          precisao?: number | null
          recebido_em?: string
          registrado_em?: string
          updated_at?: string
          vehicle_id?: string | null
          velocidade?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "nxs_location_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "nxs_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nxs_location_events_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "nxs_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nxs_location_events_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "nxs_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nxs_location_events_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "nxs_vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      nxs_vehicles: {
        Row: {
          ativo: boolean
          chassi: string | null
          codigo: string | null
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          modelo: string | null
          placa: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          chassi?: string | null
          codigo?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          modelo?: string | null
          placa?: string | null
          tipo?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          chassi?: string | null
          codigo?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          modelo?: string | null
          placa?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nxs_vehicles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "nxs_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_errors: {
        Row: {
          component: string | null
          created_at: string
          error_type: string
          id: string
          message: string
          page: string
          retry_count: number
          severity: string
          status: string
          technical_details: string | null
          timestamp: string
          user_id: string | null
        }
        Insert: {
          component?: string | null
          created_at?: string
          error_type: string
          id?: string
          message: string
          page?: string
          retry_count?: number
          severity?: string
          status?: string
          technical_details?: string | null
          timestamp?: string
          user_id?: string | null
        }
        Update: {
          component?: string | null
          created_at?: string
          error_type?: string
          id?: string
          message?: string
          page?: string
          retry_count?: number
          severity?: string
          status?: string
          technical_details?: string | null
          timestamp?: string
          user_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          departamento: string | null
          email: string | null
          id: string
          nome: string | null
        }
        Insert: {
          created_at?: string
          departamento?: string | null
          email?: string | null
          id: string
          nome?: string | null
        }
        Update: {
          created_at?: string
          departamento?: string | null
          email?: string | null
          id?: string
          nome?: string | null
        }
        Relationships: []
      }
      projeto_atualizacoes: {
        Row: {
          aplicado_em: string | null
          arquivos: Json
          created_at: string
          enviado_por: string | null
          id: string
          nome_arquivo: string
          observacoes: string | null
          status: string
          storage_bucket: string
          storage_path: string
          tamanho_bytes: number
          total_arquivos: number
          updated_at: string
          versao: string | null
        }
        Insert: {
          aplicado_em?: string | null
          arquivos?: Json
          created_at?: string
          enviado_por?: string | null
          id?: string
          nome_arquivo: string
          observacoes?: string | null
          status?: string
          storage_bucket?: string
          storage_path: string
          tamanho_bytes?: number
          total_arquivos?: number
          updated_at?: string
          versao?: string | null
        }
        Update: {
          aplicado_em?: string | null
          arquivos?: Json
          created_at?: string
          enviado_por?: string | null
          id?: string
          nome_arquivo?: string
          observacoes?: string | null
          status?: string
          storage_bucket?: string
          storage_path?: string
          tamanho_bytes?: number
          total_arquivos?: number
          updated_at?: string
          versao?: string | null
        }
        Relationships: []
      }
      protocolo_arquivos: {
        Row: {
          caminho: string
          created_at: string
          id: string
          nome: string
          protocolo_id: string
          tamanho: number
        }
        Insert: {
          caminho: string
          created_at?: string
          id?: string
          nome: string
          protocolo_id: string
          tamanho?: number
        }
        Update: {
          caminho?: string
          created_at?: string
          id?: string
          nome?: string
          protocolo_id?: string
          tamanho?: number
        }
        Relationships: [
          {
            foreignKeyName: "protocolo_arquivos_protocolo_id_fkey"
            columns: ["protocolo_id"]
            isOneToOne: false
            referencedRelation: "protocolos"
            referencedColumns: ["id"]
          },
        ]
      }
      protocolo_cartoes_ponto: {
        Row: {
          colaboradores: Json
          created_at: string
          data_geracao: string
          empresa: string
          id: string
          numero: string
          status: string
        }
        Insert: {
          colaboradores?: Json
          created_at?: string
          data_geracao: string
          empresa: string
          id: string
          numero: string
          status?: string
        }
        Update: {
          colaboradores?: Json
          created_at?: string
          data_geracao?: string
          empresa?: string
          id?: string
          numero?: string
          status?: string
        }
        Relationships: []
      }
      protocolo_folhas: {
        Row: {
          admissao: string
          arquivo: string | null
          cargo: string
          colaborador: string
          conferido: boolean
          created_at: string
          empresa: string
          id: string
          matricula: string
          ordem: number
          pagina: number | null
          posto: string
          protocolo_id: string
        }
        Insert: {
          admissao?: string
          arquivo?: string | null
          cargo?: string
          colaborador?: string
          conferido?: boolean
          created_at?: string
          empresa?: string
          id?: string
          matricula?: string
          ordem: number
          pagina?: number | null
          posto?: string
          protocolo_id: string
        }
        Update: {
          admissao?: string
          arquivo?: string | null
          cargo?: string
          colaborador?: string
          conferido?: boolean
          created_at?: string
          empresa?: string
          id?: string
          matricula?: string
          ordem?: number
          pagina?: number | null
          posto?: string
          protocolo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "protocolo_folhas_protocolo_id_fkey"
            columns: ["protocolo_id"]
            isOneToOne: false
            referencedRelation: "protocolos"
            referencedColumns: ["id"]
          },
        ]
      }
      protocolo_ponto_itens: {
        Row: {
          cargo: string
          created_at: string
          empresa: string
          id: string
          matricula: string
          nome: string
          posto: string
          protocolo_id: string
        }
        Insert: {
          cargo: string
          created_at?: string
          empresa: string
          id?: string
          matricula: string
          nome: string
          posto: string
          protocolo_id: string
        }
        Update: {
          cargo?: string
          created_at?: string
          empresa?: string
          id?: string
          matricula?: string
          nome?: string
          posto?: string
          protocolo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "protocolo_ponto_itens_protocolo_id_fkey"
            columns: ["protocolo_id"]
            isOneToOne: false
            referencedRelation: "protocolos_ponto"
            referencedColumns: ["id"]
          },
        ]
      }
      protocolos: {
        Row: {
          created_at: string
          data_entrega: string
          empresa: string | null
          id: string
          observacoes: string | null
          titulo: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data_entrega?: string
          empresa?: string | null
          id?: string
          observacoes?: string | null
          titulo: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          data_entrega?: string
          empresa?: string | null
          id?: string
          observacoes?: string | null
          titulo?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "protocolos_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      protocolos_ponto: {
        Row: {
          created_at: string
          data_criacao: string
          empresa: string
          id: string
          numero_protocolo: string
          status: string
        }
        Insert: {
          created_at?: string
          data_criacao?: string
          empresa: string
          id?: string
          numero_protocolo?: string
          status?: string
        }
        Update: {
          created_at?: string
          data_criacao?: string
          empresa?: string
          id?: string
          numero_protocolo?: string
          status?: string
        }
        Relationships: []
      }
      push_agendamentos: {
        Row: {
          agendado_para: string
          body: string | null
          category: string
          created_at: string
          criado_por: string | null
          erro: string | null
          event_type: string
          id: string
          proximo_envio_em: string | null
          publico: string
          recipient_user_ids: string[]
          repeticao: string
          status: string
          target_url: string | null
          title: string | null
          ultimo_envio_em: string | null
          updated_at: string
        }
        Insert: {
          agendado_para: string
          body?: string | null
          category: string
          created_at?: string
          criado_por?: string | null
          erro?: string | null
          event_type?: string
          id?: string
          proximo_envio_em?: string | null
          publico?: string
          recipient_user_ids?: string[]
          repeticao?: string
          status?: string
          target_url?: string | null
          title?: string | null
          ultimo_envio_em?: string | null
          updated_at?: string
        }
        Update: {
          agendado_para?: string
          body?: string | null
          category?: string
          created_at?: string
          criado_por?: string | null
          erro?: string | null
          event_type?: string
          id?: string
          proximo_envio_em?: string | null
          publico?: string
          recipient_user_ids?: string[]
          repeticao?: string
          status?: string
          target_url?: string | null
          title?: string | null
          ultimo_envio_em?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          device_name: string | null
          enabled: boolean
          endpoint: string
          id: string
          last_seen_at: string
          p256dh: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          device_name?: string | null
          enabled?: boolean
          endpoint: string
          id?: string
          last_seen_at?: string
          p256dh: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Update: {
          auth?: string
          created_at?: string
          device_name?: string | null
          enabled?: boolean
          endpoint?: string
          id?: string
          last_seen_at?: string
          p256dh?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      rastreamento_localizacoes: {
        Row: {
          bateria: number | null
          capturado_em: string
          created_at: string
          direcao: number | null
          id: string
          latitude: number
          longitude: number
          nome: string | null
          precisao_metros: number | null
          tipo_sinal: string | null
          user_id: string
          velocidade: number | null
        }
        Insert: {
          bateria?: number | null
          capturado_em?: string
          created_at?: string
          direcao?: number | null
          id?: string
          latitude: number
          longitude: number
          nome?: string | null
          precisao_metros?: number | null
          tipo_sinal?: string | null
          user_id: string
          velocidade?: number | null
        }
        Update: {
          bateria?: number | null
          capturado_em?: string
          created_at?: string
          direcao?: number | null
          id?: string
          latitude?: number
          longitude?: number
          nome?: string | null
          precisao_metros?: number | null
          tipo_sinal?: string | null
          user_id?: string
          velocidade?: number | null
        }
        Relationships: []
      }
      recovery_actions: {
        Row: {
          action: string
          automatic: boolean
          created_at: string
          duration_ms: number
          error_id: string
          id: string
          result: string
          timestamp: string
        }
        Insert: {
          action: string
          automatic?: boolean
          created_at?: string
          duration_ms?: number
          error_id: string
          id?: string
          result?: string
          timestamp?: string
        }
        Update: {
          action?: string
          automatic?: boolean
          created_at?: string
          duration_ms?: number
          error_id?: string
          id?: string
          result?: string
          timestamp?: string
        }
        Relationships: []
      }
      roteiro_visita_fotos: {
        Row: {
          capturada_em: string
          created_at: string
          geo_status: string
          id: string
          latitude: number | null
          longitude: number | null
          observacao: string
          pergunta_id: string
          pergunta_texto: string
          precisao_metros: number | null
          roteiro_id: string
          storage_path: string
          updated_at: string
          user_id: string
        }
        Insert: {
          capturada_em?: string
          created_at?: string
          geo_status?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          observacao?: string
          pergunta_id?: string
          pergunta_texto?: string
          precisao_metros?: number | null
          roteiro_id: string
          storage_path: string
          updated_at?: string
          user_id: string
        }
        Update: {
          capturada_em?: string
          created_at?: string
          geo_status?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          observacao?: string
          pergunta_id?: string
          pergunta_texto?: string
          precisao_metros?: number | null
          roteiro_id?: string
          storage_path?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "roteiro_visita_fotos_roteiro_id_fkey"
            columns: ["roteiro_id"]
            isOneToOne: false
            referencedRelation: "roteiros_visita_campo"
            referencedColumns: ["id"]
          },
        ]
      }
      roteiros_visita_campo: {
        Row: {
          cliente: string
          colaborador: string
          created_at: string
          criticas_abertas: number
          data_visita: string
          duracao_segundos: number | null
          empresa: string
          enviado_por_nome: string | null
          funcao: string
          id: string
          motivo: string
          observacao_geral: string
          observacoes: Json
          percentual_conformidade: number
          plano_acao: string
          posto: string
          posto_external_id: string
          posto_nexti_id: number | null
          relatorio_enviado_em: string | null
          relatorio_pdf_path: string | null
          respostas: Json
          supervisor: string
          total_conformes: number
          total_nao_aplicaveis: number
          total_nao_conformes: number
          updated_at: string
          user_id: string
        }
        Insert: {
          cliente?: string
          colaborador?: string
          created_at?: string
          criticas_abertas?: number
          data_visita?: string
          duracao_segundos?: number | null
          empresa?: string
          enviado_por_nome?: string | null
          funcao: string
          id?: string
          motivo?: string
          observacao_geral?: string
          observacoes?: Json
          percentual_conformidade?: number
          plano_acao?: string
          posto: string
          posto_external_id?: string
          posto_nexti_id?: number | null
          relatorio_enviado_em?: string | null
          relatorio_pdf_path?: string | null
          respostas?: Json
          supervisor?: string
          total_conformes?: number
          total_nao_aplicaveis?: number
          total_nao_conformes?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          cliente?: string
          colaborador?: string
          created_at?: string
          criticas_abertas?: number
          data_visita?: string
          duracao_segundos?: number | null
          empresa?: string
          enviado_por_nome?: string | null
          funcao?: string
          id?: string
          motivo?: string
          observacao_geral?: string
          observacoes?: Json
          percentual_conformidade?: number
          plano_acao?: string
          posto?: string
          posto_external_id?: string
          posto_nexti_id?: number | null
          relatorio_enviado_em?: string | null
          relatorio_pdf_path?: string | null
          respostas?: Json
          supervisor?: string
          total_conformes?: number
          total_nao_aplicaveis?: number
          total_nao_conformes?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      security_api_events: {
        Row: {
          card_key: string
          created_at: string
          http_status: number | null
          id: string
          latency_ms: number | null
          message: string | null
          metadata: Json
          outcome: string
          resource: string
          severity: string
          user_id: string | null
        }
        Insert: {
          card_key: string
          created_at?: string
          http_status?: number | null
          id?: string
          latency_ms?: number | null
          message?: string | null
          metadata?: Json
          outcome: string
          resource: string
          severity?: string
          user_id?: string | null
        }
        Update: {
          card_key?: string
          created_at?: string
          http_status?: number | null
          id?: string
          latency_ms?: number | null
          message?: string | null
          metadata?: Json
          outcome?: string
          resource?: string
          severity?: string
          user_id?: string | null
        }
        Relationships: []
      }
      security_audit_log: {
        Row: {
          admin_approved: boolean | null
          admin_approved_at: string | null
          admin_approved_by: string | null
          allows_rollback: boolean | null
          created_at: string | null
          description: string
          event_type: string
          id: string
          ip_address: string | null
          metadata: Json | null
          requires_admin_approval: boolean | null
          rolled_back: boolean | null
          rolled_back_at: string | null
          severity: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          admin_approved?: boolean | null
          admin_approved_at?: string | null
          admin_approved_by?: string | null
          allows_rollback?: boolean | null
          created_at?: string | null
          description: string
          event_type: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          requires_admin_approval?: boolean | null
          rolled_back?: boolean | null
          rolled_back_at?: string | null
          severity?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          admin_approved?: boolean | null
          admin_approved_at?: string | null
          admin_approved_by?: string | null
          allows_rollback?: boolean | null
          created_at?: string | null
          description?: string
          event_type?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          requires_admin_approval?: boolean | null
          rolled_back?: boolean | null
          rolled_back_at?: string | null
          severity?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      security_blocklist: {
        Row: {
          blocked_until: string
          created_at: string
          id: string
          identity: string
          reason: string
          severity: string
        }
        Insert: {
          blocked_until: string
          created_at?: string
          id?: string
          identity: string
          reason: string
          severity?: string
        }
        Update: {
          blocked_until?: string
          created_at?: string
          id?: string
          identity?: string
          reason?: string
          severity?: string
        }
        Relationships: []
      }
      security_rate_limits: {
        Row: {
          id: string
          identity: string
          request_count: number
          resource: string
          updated_at: string
          window_start: string
        }
        Insert: {
          id?: string
          identity: string
          request_count?: number
          resource: string
          updated_at?: string
          window_start?: string
        }
        Update: {
          id?: string
          identity?: string
          request_count?: number
          resource?: string
          updated_at?: string
          window_start?: string
        }
        Relationships: []
      }
      solicitacoes_acesso: {
        Row: {
          created_at: string
          decidido_em: string | null
          decidido_por: string | null
          departamento: string
          email: string
          id: string
          nome: string
          observacao: string
          role_solicitada: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          decidido_em?: string | null
          decidido_por?: string | null
          departamento?: string
          email: string
          id?: string
          nome?: string
          observacao?: string
          role_solicitada?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          decidido_em?: string | null
          decidido_por?: string | null
          departamento?: string
          email?: string
          id?: string
          nome?: string
          observacao?: string
          role_solicitada?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      solicitacoes_vagas: {
        Row: {
          aprovacao_automatica: boolean
          arquivo: string | null
          atividade: string | null
          caminho_pdf: string | null
          cargo: string
          created_at: string
          data_inicio: string | null
          decidido_em: string | null
          decidido_por: string | null
          email_destino: string | null
          fiscal_responsavel: string | null
          horario: string | null
          id: string
          justificativa: string | null
          localidade: string | null
          motivo_decisao: string | null
          pendencias: string[]
          perfil: string | null
          posto: string | null
          salario: string | null
          solicitante: string | null
          status: string
          tipo: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          aprovacao_automatica?: boolean
          arquivo?: string | null
          atividade?: string | null
          caminho_pdf?: string | null
          cargo: string
          created_at?: string
          data_inicio?: string | null
          decidido_em?: string | null
          decidido_por?: string | null
          email_destino?: string | null
          fiscal_responsavel?: string | null
          horario?: string | null
          id?: string
          justificativa?: string | null
          localidade?: string | null
          motivo_decisao?: string | null
          pendencias?: string[]
          perfil?: string | null
          posto?: string | null
          salario?: string | null
          solicitante?: string | null
          status?: string
          tipo?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          aprovacao_automatica?: boolean
          arquivo?: string | null
          atividade?: string | null
          caminho_pdf?: string | null
          cargo?: string
          created_at?: string
          data_inicio?: string | null
          decidido_em?: string | null
          decidido_por?: string | null
          email_destino?: string | null
          fiscal_responsavel?: string | null
          horario?: string | null
          id?: string
          justificativa?: string | null
          localidade?: string | null
          motivo_decisao?: string | null
          pendencias?: string[]
          perfil?: string | null
          posto?: string | null
          salario?: string | null
          solicitante?: string | null
          status?: string
          tipo?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_activity_logs: {
        Row: {
          acao: string
          created_at: string
          detalhes: Json
          id: string
          ip_address: string | null
          modulo: string
          rota: string | null
          user_agent: string | null
          user_email: string | null
          user_id: string
          user_nome: string | null
        }
        Insert: {
          acao: string
          created_at?: string
          detalhes?: Json
          id?: string
          ip_address?: string | null
          modulo?: string
          rota?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id: string
          user_nome?: string | null
        }
        Update: {
          acao?: string
          created_at?: string
          detalhes?: Json
          id?: string
          ip_address?: string | null
          modulo?: string
          rota?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string
          user_nome?: string | null
        }
        Relationships: []
      }
      user_dashboard_layouts: {
        Row: {
          dashboard: string
          layout: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          dashboard: string
          layout?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          dashboard?: string
          layout?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_permissions: {
        Row: {
          allowed: boolean
          created_at: string
          id: string
          page_key: string
          user_id: string
        }
        Insert: {
          allowed?: boolean
          created_at?: string
          id?: string
          page_key: string
          user_id: string
        }
        Update: {
          allowed?: boolean
          created_at?: string
          id?: string
          page_key?: string
          user_id?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          department: string
          display_name: string
          id: string
          last_seen_at: string
          telefone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          department?: string
          display_name?: string
          id: string
          last_seen_at?: string
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          department?: string
          display_name?: string
          id?: string
          last_seen_at?: string
          telefone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      validacoes_atestado: {
        Row: {
          atestado_id: string
          created_at: string
          descricao: string
          detalhes: string
          id: string
          impacto_pontuacao: number
          origem: string
          resultado: string
        }
        Insert: {
          atestado_id: string
          created_at?: string
          descricao: string
          detalhes?: string
          id?: string
          impacto_pontuacao?: number
          origem?: string
          resultado: string
        }
        Update: {
          atestado_id?: string
          created_at?: string
          descricao?: string
          detalhes?: string
          id?: string
          impacto_pontuacao?: number
          origem?: string
          resultado?: string
        }
        Relationships: [
          {
            foreignKeyName: "validacoes_atestado_atestado_id_fkey"
            columns: ["atestado_id"]
            isOneToOne: false
            referencedRelation: "atestados_verificados"
            referencedColumns: ["id"]
          },
        ]
      }
      visitas: {
        Row: {
          arquivo: string
          bairro: string
          cargo: string
          chave: string
          cidade: string
          cliente: string
          conformes: number
          created_at: string
          duracao_min: number | null
          endereco: string
          fim: string | null
          gerente_id: string | null
          id: string
          inicio: string | null
          local: string
          nao_conformes: number
          posto: string
          relatos: Json
          responsavel: string
          respostas: Json
          uf: string
        }
        Insert: {
          arquivo?: string
          bairro?: string
          cargo?: string
          chave: string
          cidade?: string
          cliente?: string
          conformes?: number
          created_at?: string
          duracao_min?: number | null
          endereco?: string
          fim?: string | null
          gerente_id?: string | null
          id?: string
          inicio?: string | null
          local?: string
          nao_conformes?: number
          posto?: string
          relatos?: Json
          responsavel?: string
          respostas?: Json
          uf?: string
        }
        Update: {
          arquivo?: string
          bairro?: string
          cargo?: string
          chave?: string
          cidade?: string
          cliente?: string
          conformes?: number
          created_at?: string
          duracao_min?: number | null
          endereco?: string
          fim?: string | null
          gerente_id?: string | null
          id?: string
          inicio?: string | null
          local?: string
          nao_conformes?: number
          posto?: string
          relatos?: Json
          responsavel?: string
          respostas?: Json
          uf?: string
        }
        Relationships: [
          {
            foreignKeyName: "visitas_gerente_id_fkey"
            columns: ["gerente_id"]
            isOneToOne: false
            referencedRelation: "gerentes"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_conversations: {
        Row: {
          assigned_at: string | null
          assigned_to: string | null
          contato_nome: string | null
          created_at: string
          id: string
          is_group: boolean
          last_message_at: string | null
          last_message_preview: string | null
          nao_lidas: number
          status: string
          telefone: string | null
          updated_at: string
          wa_chat_id: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_to?: string | null
          contato_nome?: string | null
          created_at?: string
          id?: string
          is_group?: boolean
          last_message_at?: string | null
          last_message_preview?: string | null
          nao_lidas?: number
          status?: string
          telefone?: string | null
          updated_at?: string
          wa_chat_id: string
        }
        Update: {
          assigned_at?: string | null
          assigned_to?: string | null
          contato_nome?: string | null
          created_at?: string
          id?: string
          is_group?: boolean
          last_message_at?: string | null
          last_message_preview?: string | null
          nao_lidas?: number
          status?: string
          telefone?: string | null
          updated_at?: string
          wa_chat_id?: string
        }
        Relationships: []
      }
      whatsapp_messages: {
        Row: {
          autor_nome: string | null
          content: string
          conversation_id: string
          created_at: string
          direcao: string
          id: string
          media_type: string | null
          media_url: string | null
          user_id: string | null
          wa_message_id: string | null
        }
        Insert: {
          autor_nome?: string | null
          content?: string
          conversation_id: string
          created_at?: string
          direcao: string
          id?: string
          media_type?: string | null
          media_url?: string | null
          user_id?: string | null
          wa_message_id?: string | null
        }
        Update: {
          autor_nome?: string | null
          content?: string
          conversation_id?: string
          created_at?: string
          direcao?: string
          id?: string
          media_type?: string | null
          media_url?: string | null
          user_id?: string | null
          wa_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_transfers: {
        Row: {
          conversation_id: string
          created_at: string
          de_user_id: string | null
          id: string
          motivo: string | null
          para_user_id: string | null
        }
        Insert: {
          conversation_id: string
          created_at?: string
          de_user_id?: string | null
          id?: string
          motivo?: string | null
          para_user_id?: string | null
        }
        Update: {
          conversation_id?: string
          created_at?: string
          de_user_id?: string | null
          id?: string
          motivo?: string | null
          para_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_transfers_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      backup_listar_tabelas: {
        Args: never
        Returns: {
          nome: string
        }[]
      }
      eh_membro_sala: {
        Args: { _room_id: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_chat_room_admin: {
        Args: { _room_id: string; _user_id: string }
        Returns: boolean
      }
      is_chat_room_member: {
        Args: { _room_id: string; _user_id: string }
        Returns: boolean
      }
      nxs_can_manage: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      nxs_is_admin_geral: { Args: { _user_id: string }; Returns: boolean }
      nxs_is_member: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      owns_protocolo_path: { Args: { _name: string }; Returns: boolean }
      pode_autorizar_movimentacao: {
        Args: { _user_id: string }
        Returns: boolean
      }
      pode_gerir_atendimento: { Args: { _user_id: string }; Returns: boolean }
      pode_ver_conversa: {
        Args: { _assigned: string; _user_id: string }
        Returns: boolean
      }
      privacidade_expurgar_dados: { Args: never; Returns: Json }
      privacidade_registrar_acesso: {
        Args: {
          _acao: string
          _finalidade?: string
          _modulo: string
          _referencia_interna?: string
        }
        Returns: undefined
      }
      security_check_rate_limit:
        | {
            Args: {
              _identity: string
              _limit: number
              _resource: string
              _window_seconds: number
            }
            Returns: Json
          }
        | {
            Args: {
              _identity: string
              _limit: number
              _resource: string
              _window_seconds: number
            }
            Returns: Json
          }
      tem_papel_interno: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role:
        | "admin"
        | "user"
        | "gerente"
        | "visualizador"
        | "diretor"
        | "cordenador"
        | "mesa_operacional"
        | "supervisor"
      nxs_alert_status:
        | "novo"
        | "reconhecido"
        | "em_atendimento"
        | "resolvido"
        | "falso_positivo"
        | "cancelado"
      nxs_device_status: "online" | "offline" | "manutencao" | "bloqueado"
      nxs_role:
        | "admin_geral"
        | "admin_empresa"
        | "supervisor"
        | "operador"
        | "colaborador"
        | "cliente"
        | "gestor"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "admin",
        "user",
        "gerente",
        "visualizador",
        "diretor",
        "cordenador",
        "mesa_operacional",
        "supervisor",
      ],
      nxs_alert_status: [
        "novo",
        "reconhecido",
        "em_atendimento",
        "resolvido",
        "falso_positivo",
        "cancelado",
      ],
      nxs_device_status: ["online", "offline", "manutencao", "bloqueado"],
      nxs_role: [
        "admin_geral",
        "admin_empresa",
        "supervisor",
        "operador",
        "colaborador",
        "cliente",
        "gestor",
      ],
    },
  },
} as const
