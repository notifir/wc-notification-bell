import { customElement, property, state } from 'lit/decorators.js'
import { ApolloQuery, html, nothing } from '@apollo-elements/lit-apollo'
import { localized, msg } from '@lit/localize'
import type { StyleInfo } from 'lit/directives/style-map.js'
import { styleMap } from 'lit/directives/style-map.js'
import { bellStyles } from './bellStyles'
import { client } from './client'
import { getNotifications, markAllAsRead, markAsRead, notificationChanged } from './queries'
import { formatDate, formatString } from './util/format'
import { setLocale } from './util/localization'

interface Notification {
  id: string
  payload: string
  type: string
  createdAt: string
  updatedAt: string
  read: boolean
  template: {
    content: string
  }
}

interface Data {
  allNotifications: {
    nodes: Array<Notification>
    __typename: string
  }
}

interface SubscriptionData {
  data: {
    notificationsUpdated: {
      notification: Notification
      event: string
    }
  }
}

interface Stylesheet {
  container: StyleInfo
  header: StyleInfo
  headerLink: StyleInfo
  headerTitle: StyleInfo
  itemsList: StyleInfo
  itemContent: StyleInfo
  itemTextPrimary: StyleInfo
  itemTextSecondary: StyleInfo
}

interface Messages {
  notifications: string
  markAllAsRead: string
  empty: string
  error: string
}

/**
 * Notification Bell.
 */
@localized()
@customElement('notification-bell')
export class NotificationBell extends ApolloQuery {
  static styles = bellStyles

  @property({ type: Boolean })
    mock = false

  @property({ type: String })
    apiUrl = ''

  @property({ type: String })
    userKey = ''

  @property({ type: Object })
    styles = {}

  @property({ type: Object })
    messages = {}

  @property({ type: String })
    locale = 'en-GB'

  @state()
  protected _open = false

  private _handleBellClick() {
    this._open = !this._open
  }

  protected async _markAsRead(id: String, read: boolean) {
    if (this.client && !read)
      return await this.client.mutate({ mutation: markAsRead, variables: { id } })

    return null
  }

  protected async _markAllAsRead(unreadCount: number) {
    if (this.client && unreadCount > 0)
      return await this.client.mutate({ mutation: markAllAsRead })

    return null
  }

  render() {
    const { data, loading, error } = this
    const styles = this.styles as Stylesheet
    const messages = this.messages as Messages
    const nodes = data && (data as Data).allNotifications && (data as Data).allNotifications.nodes
    const items = (nodes || []) as Array<Notification>
    const unreadCount = items.filter(node => !node.read).length

    return html`
      <div>
        <div class="bell" @click="${this._handleBellClick}">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-bell-fill" viewBox="0 0 16 16">
            <path d="M8 16a2 2 0 0 0 2-2H6a2 2 0 0 0 2 2zm.995-14.901a1 1 0 1 0-1.99 0A5.002 5.002 0 0 0 3 6c0 1.098-.5 6-2 7h14c-1.5-1-2-5.902-2-7 0-2.42-1.72-4.44-4.005-4.901z"/>
          </svg>
          ${(unreadCount as number) > 0 ? html`<div class="bell-counter">${unreadCount}</div>` : ''}
        </div>

        <div class="popup">
          <div class="container ${this._open ? 'open' : 'close'}" style=${styleMap(styles.container || {})}>
            <div class="header" style=${styleMap(styles.header || {})}>
              <span class="header-link" style=${styleMap(styles.headerLink || {})} @click="${() => this._markAllAsRead(unreadCount as number)}">
                ${messages.markAllAsRead || msg('Mark all as read', { id: 'mark-all-as-read' })}
              </span>
              <span class="header-title">${messages.notifications || msg('Notifications', { id: 'notifications' })}</span>
            </div>
            ${error && !loading
              ? html`<div class="status error">${messages.error || msg('Something went wrong...', { id: 'error' })}</div>`
              : nothing
            }
            ${!error && !loading && items.length === 0
              ? html`<div class="status">${messages.empty || msg('You don’t have any notifications...', { id: 'empty' })}</div>`
              : nothing
            } 
            ${!error && !loading && items.length > 0
              ? html`
                <div class="items-list" style=${styleMap(styles.itemsList || {})}>
                  ${items.map((item, index) =>
                    html`
                      <div class="item" style=${styleMap(styles.itemContent || {})} @click="${() => this._markAsRead(item.id, item.read)}">
                        ${index !== 0 ? html`<div class="divider"></div>` : ''} 
                        ${!item.read ? html`<div class="item-unread"></div>` : ''}
                        <div class="item-text-primary" style=${styleMap(styles.itemTextPrimary || {})}>
                          ${formatString(item.template.content, item.payload)}
                        </div>
                        <div class="item-text-secondary" style=${styleMap(styles.itemTextSecondary || {})}>
                          ${formatDate(item.updatedAt, this.locale)}
                        </div>
                      </div>
                    `,
                  )}
                </div>`
              : nothing
            }
          </div>
        </div>
      </div>
    `
  }

  connectedCallback() {
    super.connectedCallback()
    this.client = client(this.apiUrl, this.userKey)
    this.variables = { locale: this.locale }
    this.query = getNotifications
    setLocale(this.locale)
  }

  firstUpdated() {
    this.subscribeToMore({
      document: notificationChanged,
      variables: { userId: this.userKey, locale: this.locale },
      updateQuery: (prev, { subscriptionData }) => {
        const { notification, event } = (subscriptionData as SubscriptionData).data.notificationsUpdated
        const { __typename, nodes } = (prev as Data).allNotifications

        if (event === 'notification_created')
          return Object.assign({}, prev, { allNotifications: { __typename, nodes: [notification, ...nodes] } })

        // notification_updated
        const newNotifications = nodes.map(prev => prev.id === notification.id ? notification : prev)
        return Object.assign({}, prev, { allNotifications: { __typename, nodes: newNotifications } })
      },
    })
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'notification-bell': NotificationBell
  }
}
