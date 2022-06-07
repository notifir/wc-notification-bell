import { gql } from 'graphql-tag'
import { css } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { ApolloQuery, html } from '@apollo-elements/lit-apollo'
import { ApolloClient, ApolloLink, HttpLink, InMemoryCache } from '@apollo/client/core'
import { WebSocketLink } from '@apollo/client/link/ws'
import { getMainDefinition } from '@apollo/client/utilities'

const createWsLink = (uri: string, userKey: string) => {
  const url = new URL(uri)
  const protocol = url.hostname.includes('localhost') ? 'ws' : 'wss'
  const options = { reconnect: true, connectionParams: { 'authorization-key': userKey } }
  const wsUri = `${protocol}://${url.host}${url.pathname}`

  return new WebSocketLink({ uri: wsUri, options })
}

const createHttpLink = (uri: string, userKey: string) =>
  new HttpLink({ uri, headers: { 'authorization-key': userKey } })

const splitLink = (uri: string, userKey: string) => ApolloLink.split(
  ({ query }) => {
    const definition = getMainDefinition(query)
    return definition.kind === 'OperationDefinition' && definition.operation === 'subscription'
  },
  createWsLink(uri, userKey),
  createHttpLink(uri, userKey),
)

interface Notification {
  payload: string
  type: string
  updatedAt: string
  read: boolean
}

interface Data {
  allNotifications: {
    nodes: Array<Notification>
  }
}

interface SubscriptionData {
  data: {
    notificationsUpdated: {
      notification: Notification
    }
  }
}

export const client = (uri: string, userKey: string) =>
  new ApolloClient({
    cache: new InMemoryCache({
      typePolicies: {
        Query: {
          fields: {
            allNotifications: {
              merge(existing = [], incoming: any) {
                return { ...existing, ...incoming }
              },
            },
          },
        },
      },
    }),
    link: splitLink(uri, userKey),
    ssrForceFetchDelay: 100,
  })

const query = gql`
  query getUserNotifications {
    allNotifications(orderBy: CREATED_AT_DESC) {     
      nodes {
        id
        createdAt
        nodeId
        payload
        read
        type
        updatedAt
        userId
      }
    }
  }
`

const subscription = gql`
  subscription notificationChanged($userId: String!) {
    notificationsUpdated(userId: $userId) {
      event
      notification {
        id
        createdAt
        nodeId
        payload
        read
        type
        updatedAt
        userId
      }
    }
  }`

/**
 * Notification Bell.
 */
@customElement('notification-bell')
export class NotificationBell extends ApolloQuery {
  static styles = css`
    .x-notifications-close { display: none; }
    .x-notifications-open { display: block; }

    .x-notifications-bell {
      cursor: pointer;
      position: relative;
      width: 1.5rem;
      height: 1.5rem;
    }

    .x-notifications-bell svg {
      width: 1.5rem;
      height: 1.5rem;
    }

    .x-notifications-bell-counter { 
      position: absolute;
      top: 0%;
      left: 60%;
      font-size: 0.55rem;
      border-radius: 50%;
      width: 0.8rem;
      height: 0.8rem;
      background-color: red;
      color: #FFFFFF;
      text-align: center;
      line-height: 0.8rem;
    }

    .x-notifications-bell-counter:empty {
      display: none;
    }
    
    .x-notifications-popup {
      position: fixed;
      z-index: 1000;
    }

    .x-notifications-popup-container {
      width: 400px;
      height: 400px;
      font-size: 1rem;
      position: absolute;     
      padding: 10px;
      border-radius: 1%;
      border: 1px solid rgb(0,0,0,0.1);        
      background-color: #F6FAFD;
      font-size: 14px;
      line-height: 17px;
      font-weight: 300;
      font-family: Verdana, geneva, sans-serif;
      right: 0;
      margin-right: -10px;
    }
    
    .x-notifications-header {
      color: #444C60;
      font-weight: bold;
      padding: 7px 17px 13px;
      border-bottom: 1px solid #bbb;
    }
    
    .x-notifications-list {
      height: 370px;
      position: absolute;
      overflow-y: scroll;
    }

    .x-notifications-list-element {
      padding: 0px 18px 12px 8px;
      position: relative;
    }
    
    .divider {
      border-top: 1px solid #bbb;
    }

    .x-notifications-list-element-text {
      font-size: 14px;
      line-height: 1.2em;
      color: #444C60;
      vertical-align: top;
      padding: 12px 20px 0px 8px;
    }
    
    .x-notifications-list-element-sub-text {
      padding: 5px 10px 0px 8px;
      color: #757C85;
      font-size: 13px;
    }
       
    @keyframes pulsing {
      0% {
        transform: scale(0.95);
        box-shadow: 0 0 0 0 rgba(0, 152, 214, 0.7);
      }
  
      70% {
        transform: scale(1);
        box-shadow: 0 0 0 7px rgba(0, 152, 214, 0);
      }
  
      100% {
        transform: scale(0.95);
        box-shadow: 0 0 0 0 rgba(0, 152, 214, 0);
      }
    }
    
    .unread {   
      position: absolute;
      right: 20px;
      top: 50%;
      width: 5px;
      height: 5px;
      border: 1px solid #0098D6;      
      border-radius: 50%;
      transform: scale(1);
      animation: pulsing 2s infinite;
      background: rgba(0, 152, 214, 1);
    }
  `

  @property({ type: Boolean })
    mock = false

  @property({ type: String })
    apiUrl = ''

  @property({ type: String })
    userKey = ''

  @state()
  protected _open = false

  private _handleBellClick() {
    this._open = !this._open
  }

  protected _format(str: string, values: string) {
    const args = JSON.parse(values)
    for (const attr in args)
      str = str.split(`{${attr}}`).join(args[attr])

    return str
  }

  protected _templates = (type: string) => {
    switch (type) {
      case 'entry-created':
        return 'The entry {entryTitle} in {stepTitle} was created in {folderTitle} by {user}.'
      case 'entry-moved':
        return 'The entry {entryTitle} in {folderTitle} was moved from step {fromStepTitle} to step {toStepTitle} by {user}.'
      default:
        return ''
    }
  }

  render() {
    const { data, loading } = this
    const notifications = data && (data as Data).allNotifications && (data as Data).allNotifications.nodes
    const unreadCount = notifications && (notifications as Array<Notification>).filter(node => !node.read).length

    return html`
      <div class="x-notifications-bell-wrapper">
        <div class="x-notifications-bell" @click="${this._handleBellClick}">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-bell-fill" viewBox="0 0 16 16">
            <path d="M8 16a2 2 0 0 0 2-2H6a2 2 0 0 0 2 2zm.995-14.901a1 1 0 1 0-1.99 0A5.002 5.002 0 0 0 3 6c0 1.098-.5 6-2 7h14c-1.5-1-2-5.902-2-7 0-2.42-1.72-4.44-4.005-4.901z"/>
          </svg>
         
          ${(unreadCount as number) > 0 ? html`<div class="x-notifications-bell-counter">${unreadCount}</div>` : ''}
        </div>

        <div class="x-notifications-popup">
          <div class="x-notifications-popup-container ${this._open ? 'x-notifications-open' : 'x-notifications-close'}">
            <div class = "x-notifications-header">Notifications</div>
            <div class = "x-notifications-list">
              ${!loading && notifications && (notifications as Array<Notification>).map((item, index) =>
                html`<div class = "x-notifications-list-element">
                  ${index !== 0 ? html`<div class="divider"></div>` : ''}
                  ${!item.read ? html`<div class = "unread"></div>` : ''}
                  <div class = "x-notifications-list-element-text">${this._format(this._templates(item.type), item.payload)}</div>
                    <div class = "x-notifications-list-element-sub-text">${new Date(item.updatedAt).toLocaleString()}</div>
                </div>`)}
            </div>
          </div>
        </div>
      </div>
    `
  }

  connectedCallback() {
    super.connectedCallback()
    this.client = client(this.apiUrl, this.userKey)
    this.query = query
  }

  firstUpdated() {
    this.subscribeToMore({
      document: subscription,
      variables: { userId: this.userKey },
      updateQuery: (prev, { subscriptionData }) => {
        const { notification } = (subscriptionData as SubscriptionData).data.notificationsUpdated

        return Object.assign({}, prev, {
          allNotifications: {
            nodes: [notification, ...(prev as Data).allNotifications.nodes],
          },
        })
      },
    })
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'notification-bell': NotificationBell
  }
}
