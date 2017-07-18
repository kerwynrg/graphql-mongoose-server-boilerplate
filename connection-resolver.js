/* @flow */
import Promise from 'bluebird';
import {
  reverse,
  map
} from 'lodash';
import { BaseRepository } from 'utils';
import type {
  PaginationType,
  EdgesType,
  ConnectionType,
  OrderByType
} from 'utils/types';

export default class ConnectionResolver {
  repository: BaseRepository;
  pagination: PaginationType;
  orderBy: OrderByType | typeof undefined;
  params: Object;
  resolverInfo: Object;

  edgesArray: EdgesType;
  totalCount: number;
  cursors: {
    start?: string,
    end?: string
  };
  hasPages: {
    previous: boolean,
    next: boolean
  };

  constructor (repository: BaseRepository, args: {
    params?: Object,
    pagination?: PaginationType,
    orderBy?: OrderByType
  }, resolverInfo: Object) {
    this.repository = repository;
    this.pagination = args.pagination || {};
    this.orderBy = args.orderBy;
    this.params = args.params || {};
    this.resolverInfo = resolverInfo;

    this.edgesArray = [];
  }

  _isFirstDocument (id: string): Promise {
    return this.repository.isFirstDocument(id);
  }

  _isLastDocument (id: string): Promise {
    return this.repository.isLastDocument(id);
  }

  async _resolveTotalCount (): Promise {
    this.totalCount = await this.repository.count();
  }

  _resolvePaginationParams () {
    if (this.pagination.first && this.pagination.last) {
      // TODO: Improve message handler and add resource name
      throw Error('Passing both `first` and `last` values to paginate is not supported');
    }

    // TODO: Split logic in methods
    if (this.pagination.before && this.pagination.before !== '') {
      let beforeCursorDecoded = Buffer.from(this.pagination.before, 'base64').toString('ascii');
      this.repository.beforeId(beforeCursorDecoded);
    }

    if (this.pagination.after && this.pagination.after !== '') {
      let afterCursorDecoded = Buffer.from(this.pagination.after, 'base64').toString('ascii');
      this.repository.afterId(afterCursorDecoded);
    }

    // TODO: Throw error otherwise
    if (this.pagination.first && this.pagination.first >= 0) {
      this.repository.limit(this.pagination.first >> 0);
    }

    // TODO: Throw error otherwise
    if (this.pagination.last && this.pagination.last >= 0) {
      this.repository.limitReverse(this.pagination.last >> 0);
    }
  }

  async _resolveData (): Promise {
    this.repository.get(this.params);
    if (this.orderBy) {
      this.repository.sort({
        [this.orderBy.field]: this.orderBy.direction
      });
    }
    this._resolvePaginationParams();
    let promiseResults = this.repository.exec();
    promiseResults.then((data: [?Object]) => {
      if (this.pagination.last && !this.orderBy) {
        data = reverse(data);
      }
      this.edgesArray = map(data, (doc: Object): Object => {
        return {
          cursor: Buffer.from(doc.id.toString()).toString('base64'),
          node: doc
        };
      });
    });
  }

  async _resolvePaginationData (): Promise {
    this.hasPages = {
      previous: false,
      next: false
    };

    this.cursors = {};

    if (this.edgesArray.length > 0) {
      this.cursors.start = this.edgesArray[0].cursor;
      this.cursors.end = this.edgesArray[this.edgesArray.length - 1].cursor;
    }

    if (this.pagination.last) {
      if (this.cursors.start) {
        let startCursorDecoded = Buffer.from(`${this.cursors.start}`, 'base64').toString('ascii');
        this.hasPages.previous = !(await this._isFirstDocument(startCursorDecoded));
      }
    }

    if (this.pagination.first) {
      if (this.cursors.end) {
        let endCursorDecoded = Buffer.from(`${this.cursors.end}`, 'base64').toString('ascii');
        this.hasPages.next = !(await this._isLastDocument(endCursorDecoded));
      }
    }
  }

  async resolve (): Promise {
    await Promise.all([
      this._resolveData(),
      this._resolveTotalCount()
    ]);
    await this._resolvePaginationData();

    const result: ConnectionType = {
      edges: this.edgesArray,
      pageInfo: {
        startCursor: this.cursors.start,
        endCursor: this.cursors.end,
        hasNextPage: this.hasPages.next,
        hasPreviousPage: this.hasPages.previous
      },
      totalCount: this.totalCount
    };

    return result;
  }
}
