/* @flow */
import BaseModel from './base-model';
import {
  isUndefined,
  camelCase,
  each
} from 'lodash';
import {
  DB_COUNT_TYPE,
  ORDER
} from 'utils/constants';

type CountType = $Keys<typeof DB_COUNT_TYPE>;
type OrderType = $Keys<typeof ORDER>;

export default class BaseRepository {
  modelClass: typeof BaseModel;
  _activeQuery: Object;
  _hasBeenOrdered: boolean;
  _isAggregation: boolean;
  _orderBy: Object | null;

  constructor (modelClass: typeof BaseModel) {
    this.modelClass = modelClass;
    this._resetActiveQuery();

    this._isAggregation = false;
    this._hasBeenOrdered = false;
    this._orderBy = null;
  }

  _resetActiveQuery () {
    delete this._activeQuery;
    this._isAggregation = false;
    this._orderBy = null;
  }

  _initActiveQuery (): BaseRepository {
    if (isUndefined(this._activeQuery)) {
      this._activeQuery = this.modelClass;
    }

    return this;
  }

  exec (): * {
    if (this._orderBy) {
      this._activeQuery = this._activeQuery.sort(this._orderBy);
    }

    let result = this._activeQuery.exec();
    this._resetActiveQuery();

    return result;
  }

  onDemand (): * {
    if (this._orderBy) {
      this._activeQuery = this._activeQuery.sort(this._orderBy);
    }

    if (this._isAggregation) {
      throw 'Operation not allowed with aggregation.';
    }

    let result = this._activeQuery.cursor();
    this._resetActiveQuery();

    return result;
  }

  limit (qty: number): BaseRepository {
    this._initActiveQuery();
    if (this._isAggregation && this._orderBy) {
      this._activeQuery = this._activeQuery.sort(this._orderBy);
      this._orderBy = null;
    }
    this._activeQuery = this._activeQuery.limit(qty);

    return this;
  }

  limitReverse (qty: number): BaseRepository {
    this._initActiveQuery();
    let loopCount = this._isAggregation ? 2 : 1;
    if (!this._hasBeenOrdered) {
      this._orderBy = {
        _id: this._isAggregation ? -1 : 1
      };
    }

    for (var i = 0; i < loopCount; i++) {
      let parsedOrderBy = {};
      let isFirstLoop = i === 0;
      each(this._orderBy, (order: number, field: string) => {
        let multiplier = isFirstLoop ? -1 : 1;
        parsedOrderBy[field] = order * multiplier;
      });
      this._activeQuery = this._activeQuery.sort(parsedOrderBy);
      if (isFirstLoop) {
        this._activeQuery = this._activeQuery.limit(qty);
      }
    }

    this._orderBy = null;

    return this;
  }

  beforeId (id: string): BaseRepository {
    this._initActiveQuery();
    this._activeQuery = this._activeQuery.where('_id').lt(id);

    return this;
  }

  afterId (id: string): BaseRepository {
    this._initActiveQuery();
    this._activeQuery = this._activeQuery.where('_id').gt(id);

    return this;
  }

  create (): {} {
    return {};
  }

  delete (): boolean {
    return false;
  }

  get (params: Object): BaseRepository {
    this._initActiveQuery();
    this._activeQuery = this._activeQuery.find(this.parseFindParams(params));

    return this;
  }

  // DON'T USE can't return mongoose cursor and not retrieves instances, only mongodb native documents.
  // aggregate (params: Object): BaseRepository {
  //   this._initActiveQuery();
  //   this._activeQuery = this._activeQuery.aggregate();
  //   this._activeQuery.match(this.parseFindParams(params));
  //   this._isAggregation = true;
  //
  //   return this;
  // }

  sort (orderBy: {
    [field: string]: OrderType
  }): BaseRepository {
    if (!orderBy) {
      return this;
    }

    this._initActiveQuery();
    this._hasBeenOrdered = true;

    let parsedOrderBy = {};
    each(orderBy, (order: OrderType, field: string) => {
      let orderMultiplier = order === ORDER.DESC ? -1 : 1;
      field = camelCase(field || '');
      parsedOrderBy[field] = orderMultiplier;
    });

    this._orderBy = parsedOrderBy;
    if (!this._isAggregation) {
      this._activeQuery.sort(parsedOrderBy);
    }

    return this;
  }

  async isFirstDocument (id: string): Promise<boolean> {
    const countLowerDocs = await this.count(id, DB_COUNT_TYPE.LOWER_THAN);

    return (countLowerDocs >> 0) === 0;
  }

  async isLastDocument (id: string): Promise<boolean> {
    const countGreaterDocs = await this.count(id, DB_COUNT_TYPE.GREATHER_THAN);

    return (countGreaterDocs >> 0) === 0;
  }

  async count (id?: string, type?: CountType): Promise<number> {
    let counter = this.modelClass;
    if (id) {
      counter = counter.where('_id');
      switch (type) {
      case DB_COUNT_TYPE.LOWER_THAN:
        counter = counter.lt(id);
        break;
      case DB_COUNT_TYPE.GREATHER_THAN:
      default:
        counter = counter.gt(id);
        break;
      }
    }

    return await counter.count();
  }

  getOne (params: Object): Object {
    return this.modelClass.findOne(params).exec();
  }

  getOneById (id: string): Object {
    return this.modelClass.findById(id).exec();
  }

  save (): boolean {
    return false;
  }

  parseFindParams (params: Object): Object {
    return params;
  }
}
