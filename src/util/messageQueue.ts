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

export interface MessageQueueState<RESPONSE> {
  timeoutPromise: Promise<void>;
  commandPromise: Promise<void>;
  responsePromise: DeferredPromise<RESPONSE>;
}

export class MessageQueue<KEY, RESPONSE> {
  private readonly queue: Map<KEY, MessageQueueState<RESPONSE>>;

  constructor(private readonly log: Logger, private readonly defaultTimeout: number) {
    assert(defaultTimeout && defaultTimeout > 0);
    this.queue = new Map<KEY, MessageQueueState<RESPONSE>>();
  }

  public get size() {
    return this.queue.size;
  }

  enqueue(key: KEY, commandPromise: Promise<void>, timeout = NaN): KEY {
    const messageTimeout = isNaN(timeout) ? this.defaultTimeout : timeout;
    const responsePromise = new DeferredPromise<RESPONSE>();
    const timeoutPromise = new Promise<void>((resolve, reject) => {
      setTimeout(() => reject(new Error('message response timeout')), messageTimeout);
    });
    this.queue.set(key, { timeoutPromise, commandPromise, responsePromise });
    return key;
  }

  dequeue(key: KEY): MessageQueueState<RESPONSE> | undefined {
    const state = this.queue.get(key);
    if (state) {
      this.queue.delete(key);
    }
    return state;
  }

  processResponse(key: KEY, response: RESPONSE) {
    const state = this.dequeue(key);
    if (!state) {
      this.log.warn(`processResponse: key '${key}' not found`);
      return;
    }
    state.responsePromise.resolve(response);
  }

  async wait(keys: KEY[]): Promise<RESPONSE[]> {
    assert(keys && keys.length > 0);
    const states = keys.map((key) => {
      const state = this.queue.get(key);
      if (!state) {
        throw new Error(`state with key '${key}' could not be found`);
      }
      return state;
    });

    // Wait for command or timeout
    const waitPromises = states.map((state) => {
      return Promise.race([state.commandPromise, state.timeoutPromise]);
    });

    try {
      await Promise.all(waitPromises);
    } catch (error) {
      this.log.error(`error: '${error}'`);
      this.log.debug('stack:', error.stack);
      return [];
    }

    const messagePromises = states.map((state) => state.responsePromise);
    return Promise.all(messagePromises);
  }
}
