import { Component } from '@angular/core'
import { CommonModule } from '@angular/common'

const API = 'https://jsonplaceholder.typicode.com'

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule],
  template: `
    <main class="app">
      <header>
        <span class="badge angular">Angular</span>
        <h1>Browser OpenTelemetry Test Subject</h1>
        <p>Click buttons to generate document-load, fetch, XHR, and user-interaction spans.</p>
      </header>

      <section class="actions">
        <button (click)="fetchGet()">fetch GET</button>
        <button (click)="fetchPost()">fetch POST</button>
        <button (click)="xhrGet()">XHR GET</button>
        <button (click)="bump()">counter: {{ count }}</button>
      </section>

      <section class="log">
        <h2>Activity log</h2>
        <ul>
          <li *ngIf="log.length === 0" class="muted">No activity yet.</li>
          <li *ngFor="let l of log">{{ l }}</li>
        </ul>
      </section>
    </main>
  `,
})
export class AppComponent {
  count = 0
  log: string[] = []

  private append(line: string): void {
    const ts = new Date().toLocaleTimeString()
    this.log = [`[${ts}] ${line}`, ...this.log].slice(0, 12)
  }

  async fetchGet(): Promise<void> {
    this.append('fetch GET /todos/1 ...')
    try {
      const res = await fetch(`${API}/todos/1`)
      const data = await res.json()
      this.append(`fetch GET ok: "${data.title}"`)
    } catch (e) {
      this.append(`fetch GET error: ${(e as Error).message}`)
    }
  }

  async fetchPost(): Promise<void> {
    this.append('fetch POST /posts ...')
    try {
      const res = await fetch(`${API}/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'otel', body: 'browser', userId: 1 }),
      })
      const data = await res.json()
      this.append(`fetch POST ok: created id ${data.id}`)
    } catch (e) {
      this.append(`fetch POST error: ${(e as Error).message}`)
    }
  }

  xhrGet(): void {
    this.append('XHR GET /users/1 ...')
    const xhr = new XMLHttpRequest()
    xhr.open('GET', `${API}/users/1`)
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText)
        this.append(`XHR GET ok: ${data.name}`)
      } catch {
        this.append('XHR GET ok (unparsed)')
      }
    }
    xhr.onerror = () => this.append('XHR GET error')
    xhr.send()
  }

  bump(): void {
    this.count += 1
    this.append(`counter -> ${this.count}`)
  }
}
