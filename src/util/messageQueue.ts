import { Logger } from 'homebridge';
import assert from 'assert';
import Timeout = NodeJS.Timeout;

/**
 * A new instance of deferred is constructed by calling `new DeferredPromse<T>()`.
 * The purpose of the deferred object is to expose the associated Promise
 * instance APIs that can be used for signaling the successful
 * or unsuccessful completion, as well as the state of the task.
 * @export
 * @class DeferredPromise
 * @implements {Promise<T>}
 * @template T
 * @example
 * const deferred = new DeferredPromse<string>();
 * console.log(deferred.state); // 'pending'
 *
 * deferred
 * .then(str => console.log(str))
 * .catch(err => console.error(err));
 *
 * deferred.resolve('Foo');
 * console.log(deferred.state); // 'fulfilled'
 * // deferred.reject('Bar');
 */
export class DeferredPromise<T> implements Promise<T> {
  [Symbol.toStringTag]: 'Promise';

  private _promise: Promise<T>;
  private _resolve!: (value?: T | PromiseLike<T>) => void;
  private _reject!: (reason?: any) => void;
  private _state: 'pending' | 'fulfilled' | 'rejected' = 'pending';

  public get state(): 'pending' | 'fulfilled' | 'rejected' {
    return this._state;
  }

  public get promise() {
    return this._promise;
  }

  constructor() {
    this._promise = new Promise<T>((resolve, reject) => {
      this._resolve = resolve;
      this._reject = reject;
    });
  }

  public then<TResult1, TResult2>(
    onfulfilled?: (value: T) => TResult1 | PromiseLike<TResult1>,
    onrejected?: (reason: any) => TResult2 | PromiseLike<TResult2>,
  ): Promise<TResult1 | TResult2> {
    return this._promise.then(onfulfilled, onrejected);
  }

  public catch<TResult>(onrejected?: (reason: any) => TResult | PromiseLike<TResult>): Promise<T | TResult> {
    return this._promise.catch(onrejected);
  }

  public finally(onfinally?: (() => void) | undefined | null): Promise<T> {
    return this._promise.finally(onfinally);
  }

  public resolve(value?: T | PromiseLike<T>): void {
    this._resolve(value);
    this._state = 'fulfilled';
  }

  public reject(reason?: any): void {
    this._reject(reason);
    this._state = 'rejected';
  }
}

export interface MessageQueueState<KEY, RESPONSE> {
  timestamp: number;
  key: KEY;
  deferredPromise: DeferredPromise<RESPONSE>;
}

export class MessageQueue<KEY, RESPONSE> {
  private readonly queue: MessageQueueState<KEY, RESPONSE>[];
  private readonly timeout: Timeout;

  constructor(private readonly log: Logger, private readonly timeoutValue: number) {
    assert(timeoutValue && timeoutValue > 0);

    this.queue = [];
    this.timeout = setTimeout(() => {
      this.cleanPending(timeoutValue);
    }, timeoutValue);
  }

  public get length() {
    return this.queue.length;
  }

  enqueue(key: KEY): Promise<RESPONSE> {
    const timestamp = new Date().getTime();
    const deferredPromise = new DeferredPromise<RESPONSE>();
    this.queue.push({ timestamp, key, deferredPromise });
    return deferredPromise.promise;
  }

  dequeue(key: KEY): MessageQueueState<KEY, RESPONSE> | null {
    const index = this.queue.findIndex((qm) => qm.key === key);
    if (index >= 0) {
      return this.queue.splice(index, 1)[0];
    }
    return null;
  }

  processResponse(key: KEY, response: RESPONSE) {
    const state = this.dequeue(key);
    if (!state) {
      this.log.warn(`processResponse: key '${key}' not found`);
      return;
    }
    state.deferredPromise.resolve(response);
  }

  async wait(promises: Promise<RESPONSE>[]): Promise<RESPONSE[]> {
    const responses = await Promise.all<RESPONSE>(promises);
    this.queue.splice(this.queue.length);
    return responses;
  }

  flush(shutdown?: boolean): void {
    if (shutdown) {
      this.queue.forEach((value) => value.deferredPromise.reject(new Error('flushing queue')));
    }
    this.queue.length = 0;
  }

  cleanPending(timeoutValue: number) {
    const currentTime = new Date().getTime();
    const toKeep = this.queue.reduce((keep: MessageQueueState<KEY, RESPONSE>[], value) => {
      const delta = currentTime - value.timestamp;
      if (delta > timeoutValue) {
        const message = JSON.stringify(value.key);
        this.log.error(`Rejecting unresolved promise after ${delta}ms (${message})`);
        value.deferredPromise.reject(new Error(`Timeout for message:  ${message}`));
        return keep;
      }
      keep.push(value);
      return keep;
    }, []);
    this.flush();
    this.queue.push(...toKeep);
    this.timeout.refresh();
  }
}
